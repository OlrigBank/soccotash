import { z } from 'astro/zod';

export const WELCOME_ORIGIN = 'https://olrig-bank.com';
const permanentId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = z.string().trim().min(1, 'Enter some text.');

export function safeWelcomeLink(value: string): boolean {
  if (!value || value !== value.trim() || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value, WELCOME_ORIGIN);
    return !url.username && !url.password && (
      (value.startsWith('/') && !value.startsWith('//') && url.origin === WELCOME_ORIGIN)
      || (/^https:\/\/[^/]/.test(value) && url.protocol === 'https:')
    );
  } catch { return false; }
}

const id = text.regex(permanentId, 'Use lowercase letters, numbers and single hyphens.');
export const welcomeSchema = z.object({
  title: text,
  description: text,
  introduction: text,
  supportingText: text,
  logo: text.refine(value => /^\/media\/images\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|svg)$/.test(value)
    && !value.split('/').includes('..'), 'Choose a local image from the media library.'),
  logoAlt: text,
  closingMessage: text,
  printFooter: text,
  emergencyMessage: text,
  topics: z.array(z.object({
    id,
    title: text,
    summary: text,
    detailsUrl: text.refine(safeWelcomeLink, 'Use a same-site /path/ or safe https:// URL.'),
    detailsLabel: text,
    status: z.enum(['active', 'retired']).default('active'),
    aliases: z.array(id).default([]),
    includeContactDetails: z.boolean().default(false),
  })),
}).superRefine((content, context) => {
  const reserved = new Set(['main-content', 'welcome-topics', 'welcome-retired', 'welcome-title', 'welcome-paper', 'welcome-paper-size', 'welcome-print']);
  content.topics.forEach((topic, index) => {
    for (const fragment of [topic.id, ...topic.aliases]) {
      if (reserved.has(fragment)) context.addIssue({ code: 'custom', path: ['topics', index, 'id'], message: `Duplicate or reserved topic ID: ${fragment}.` });
      reserved.add(fragment);
    }
  });
});

export type WelcomeContent = z.infer<typeof welcomeSchema>;
export type WelcomeTopic = WelcomeContent['topics'][number];
export type WelcomeContact = { phone: string; email: string };

export const welcomeContactSchema = z.object({
  phone: text.regex(/^\+?[0-9 ()-]+$/, 'Enter a public telephone number.'),
  email: z.email('Enter a public email address.'),
});

export function topicSummary(topic: WelcomeTopic, contact: WelcomeContact): string {
  return topic.includeContactDetails
    ? `${topic.summary} Call ${contact.phone} or email ${contact.email}.`
    : topic.summary;
}

export function welcomeQrUrl(topicId: string): string {
  if (!permanentId.test(topicId)) throw new Error('Invalid welcome topic ID.');
  return `${WELCOME_ORIGIN}/welcome/#${topicId}`;
}

/** Compare every historical snapshot, keeping all previously printed fragments. */
export function assertWelcomeHistory(previous: WelcomeContent, current: WelcomeContent): void {
  const owners = new Map(current.topics.flatMap(topic => [topic.id, ...topic.aliases].map(fragment => [fragment, topic] as const)));
  for (const oldTopic of previous.topics) {
    const destination = owners.get(oldTopic.id);
    if (!destination) throw new Error(`Keep topic ${oldTopic.id} with status retired instead of deleting its printed destination.`);
    if (oldTopic.status === 'retired' && destination.status !== 'retired') throw new Error(`Retired topic ${oldTopic.id} is reserved and cannot be reused.`);
    for (const fragment of oldTopic.aliases) {
      if (owners.get(fragment) !== destination) throw new Error(`Keep alias ${fragment} attached to ${oldTopic.id}.`);
    }
  }
}
