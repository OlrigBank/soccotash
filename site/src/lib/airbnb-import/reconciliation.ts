import type { Pool, PoolClient } from 'pg';

interface Candidate {
  reviewId: string;
  reservationId: string;
  reviewerName: string;
  bookerName: string;
  partyName: string | null;
}

export interface ReconciliationResult {
  reviewsConsidered: number;
  candidatesFound: number;
  linksAdded: number;
  automaticallyConfirmed: number;
  proposed: number;
  manualDecisionsPreserved: number;
}

function normaliseIdentity(value: string | null): string {
  return (value ?? '').normalize('NFKD').replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en-GB').replace(/[^a-z0-9]+/gu, '');
}

function identityCompatible(candidate: Candidate): boolean {
  const review = normaliseIdentity(candidate.reviewerName);
  const identities = [candidate.bookerName, candidate.partyName].map(normaliseIdentity).filter(Boolean);
  return review.length >= 3 && identities.some((identity) => identity === review
    || (identity.length >= 3 && (identity.includes(review) || review.includes(identity))));
}

async function candidateRows(client: PoolClient): Promise<Candidate[]> {
  const result = await client.query<{
    review_id: string; reservation_id: string; reviewer_display_name: string;
    booker_display_name: string; party_display_name: string | null;
  }>(
    `SELECT review.id::text AS review_id, reservation.id::text AS reservation_id,
            review.reviewer_display_name, reservation.booker_display_name,
            reservation.party_display_name
       FROM airbnb_reviews review
       JOIN airbnb_reservations reservation
         ON reservation.property_id = review.property_id
        AND reservation.arrival = review.arrival
        AND reservation.departure = review.departure
        AND reservation.nights = review.nights
      ORDER BY review.id, reservation.id`,
  );
  return result.rows.map((row) => ({
    reviewId: row.review_id,
    reservationId: row.reservation_id,
    reviewerName: row.reviewer_display_name,
    bookerName: row.booker_display_name,
    partyName: row.party_display_name,
  }));
}

export async function reconcileAirbnbReviews(database: Pool): Promise<ReconciliationResult> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const reviewCount = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM airbnb_reviews');
    const candidates = await candidateRows(client);
    const byReview = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      byReview.set(candidate.reviewId, [...(byReview.get(candidate.reviewId) ?? []), candidate]);
    }
    const compatibleReservationCounts = new Map<string, number>();
    for (const candidate of candidates.filter(identityCompatible)) {
      compatibleReservationCounts.set(
        candidate.reservationId,
        (compatibleReservationCounts.get(candidate.reservationId) ?? 0) + 1,
      );
    }
    let linksAdded = 0;
    let automaticallyConfirmed = 0;
    let proposed = 0;
    let manualDecisionsPreserved = 0;
    for (const candidate of candidates) {
      const reviewCandidates = byReview.get(candidate.reviewId)!;
      const compatible = identityCompatible(candidate);
      const compatibleForReview = reviewCandidates.filter(identityCompatible);
      const autoConfirm = compatible && compatibleForReview.length === 1
        && compatibleReservationCounts.get(candidate.reservationId) === 1;
      const evidence = {
        propertyExact: true,
        arrivalExact: true,
        departureExact: true,
        nightsExact: true,
        identityCompatible: compatible,
        stayCandidateCount: reviewCandidates.length,
        identityCompatibleCandidateCount: compatibleForReview.length,
      };
      const inserted = await client.query<{ link_status: string; decision_source: string | null }>(
        `INSERT INTO airbnb_review_reservation_links
           (review_id, reservation_id, link_status, match_method, confidence,
            evidence, decision_source, reviewed_at)
         VALUES ($1, $2, $3, 'stay_listing_identity', $4, $5::jsonb,
                 CASE WHEN $3='confirmed' THEN 'automatic' ELSE NULL END,
                 CASE WHEN $3='confirmed' THEN NOW() ELSE NULL END)
         ON CONFLICT (review_id, reservation_id) DO NOTHING
         RETURNING link_status, decision_source`,
        [candidate.reviewId, candidate.reservationId, autoConfirm ? 'confirmed' : 'proposed',
          autoConfirm ? 1 : compatible ? 0.9 : 0.75, JSON.stringify(evidence)],
      );
      if (inserted.rowCount) {
        linksAdded += 1;
        if (autoConfirm) automaticallyConfirmed += 1;
        else proposed += 1;
      } else {
        const current = await client.query<{ decision_source: string | null }>(
          `SELECT decision_source FROM airbnb_review_reservation_links
            WHERE review_id=$1 AND reservation_id=$2`,
          [candidate.reviewId, candidate.reservationId],
        );
        if (current.rows[0]?.decision_source === 'manual') manualDecisionsPreserved += 1;
      }
    }
    await client.query('COMMIT');
    return {
      reviewsConsidered: reviewCount.rows[0].count,
      candidatesFound: candidates.length,
      linksAdded,
      automaticallyConfirmed,
      proposed,
      manualDecisionsPreserved,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function decideAirbnbReviewReservationLink(
  database: Pool,
  input: { linkId: string; decision: 'confirmed' | 'rejected'; adminUserId: string },
): Promise<void> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const target = await client.query<{ review_id: string; reservation_id: string }>(
      `SELECT review_id::text, reservation_id::text
         FROM airbnb_review_reservation_links
        WHERE id=$1 AND link_status='proposed' AND decision_source IS NULL
        FOR UPDATE`,
      [input.linkId],
    );
    if (!target.rowCount) throw new Error('Candidate does not exist or has already been decided.');
    if (input.decision === 'confirmed') {
      const superseded = await client.query<{ id: string; review_id: string; reservation_id: string; decision_source: string }>(
        `SELECT id::text, review_id::text, reservation_id::text, decision_source
           FROM airbnb_review_reservation_links
          WHERE link_status='confirmed' AND id<>$1
            AND (review_id=$2 OR reservation_id=$3)
          FOR UPDATE`,
        [input.linkId, target.rows[0].review_id, target.rows[0].reservation_id],
      );
      if (superseded.rows.some((row) => row.decision_source === 'manual')) {
        throw new Error('Candidate conflicts with an existing manual confirmation.');
      }
      for (const link of superseded.rows) {
        await client.query(
          `UPDATE airbnb_review_reservation_links
              SET link_status='rejected', match_method='manual', decision_source='manual',
                  reviewed_by_admin_user_id=$2, reviewed_at=NOW(), updated_at=NOW()
            WHERE id=$1`,
          [link.id, input.adminUserId],
        );
        await client.query(
          `INSERT INTO admin_audit_log
             (admin_user_id, action, entity_type, entity_id, details)
           VALUES ($1, 'airbnb_review_reservation_superseded',
                   'airbnb_review_reservation_link', $2,
                   jsonb_build_object('decision','rejected','reviewId',$3::text,
                                      'reservationId',$4::text,'supersededByLinkId',$5::text))`,
          [input.adminUserId, link.id, link.review_id, link.reservation_id, input.linkId],
        );
      }
    }
    const decided = await client.query<{ review_id: string; reservation_id: string }>(
      `UPDATE airbnb_review_reservation_links
          SET link_status=$2, match_method='manual', confidence=1,
              decision_source='manual', reviewed_by_admin_user_id=$3,
              reviewed_at=NOW(), updated_at=NOW()
        WHERE id=$1 AND link_status='proposed' AND decision_source IS NULL
        RETURNING review_id::text, reservation_id::text`,
      [input.linkId, input.decision, input.adminUserId],
    );
    if (!decided.rowCount) throw new Error('Candidate does not exist or has already been decided.');
    await client.query(
      `INSERT INTO admin_audit_log
         (admin_user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'airbnb_review_reservation_decided', 'airbnb_review_reservation_link', $2,
               jsonb_build_object('decision',$3::text,'reviewId',$4::text,'reservationId',$5::text))`,
      [input.adminUserId, input.linkId, input.decision,
        decided.rows[0].review_id, decided.rows[0].reservation_id],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
