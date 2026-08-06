import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../../lib/admin/auth.ts';
import { archiveLocalGuideEntry, changeLocalGuideSlug, createLocalGuideDraft, editLocalGuideDraft,
  publishLocalGuideEntry, restoreLocalGuideRevision, unpublishLocalGuideEntry } from '../../../../lib/local-guide/repository.ts';
import { LocalGuideError } from '../../../../lib/local-guide/types.ts';

export const prerender = false;
type Input = Record<string, unknown>;
const text = (value: unknown) => String(value ?? '');
const nullable = (value: unknown) => text(value).trim() || null;
const version = (value: unknown) => Number(value);
const content = (input: Input) => ({
  title:text(input.title), summary:text(input.summary), markdownBody:text(input.markdownBody), categoryId:text(input.categoryId),
  categoryLabel:nullable(input.categoryLabel), imagePath:nullable(input.imagePath), externalLink:nullable(input.externalLink),
  recommended:input.recommended === true || input.recommended === 'true', legacyText:nullable(input.legacyText),
});

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return Response.json({ error:'Cross-site request forbidden.' }, { status:403 });
  let input: Input; try { input=await request.json(); } catch { return Response.json({error:'A valid JSON request is required.'},{status:400}); }
  const actor={type:'administrator' as const,adminUserId:locals.adminUser!.id,source:'admin_local_guide'};
  try {
    let entry;
    switch(input.action){
      case 'create': entry=await createLocalGuideDraft({slug:text(input.slug),content:content(input),actor}); break;
      case 'edit': entry=await editLocalGuideDraft({entryId:text(input.entryId),expectedVersion:version(input.expectedVersion),content:content(input),actor}); break;
      case 'publish': entry=await publishLocalGuideEntry({entryId:text(input.entryId),expectedVersion:version(input.expectedVersion),actor}); break;
      case 'unpublish': entry=await unpublishLocalGuideEntry({entryId:text(input.entryId),expectedVersion:version(input.expectedVersion),actor}); break;
      case 'archive': entry=await archiveLocalGuideEntry({entryId:text(input.entryId),expectedVersion:version(input.expectedVersion),actor}); break;
      case 'slug': entry=await changeLocalGuideSlug({entryId:text(input.entryId),expectedVersion:version(input.expectedVersion),slug:text(input.slug),actor}); break;
      case 'restore': entry=await restoreLocalGuideRevision({entryId:text(input.entryId),revisionId:text(input.revisionId),expectedVersion:version(input.expectedVersion),actor}); break;
      default:return Response.json({error:'Local Guide action is invalid.'},{status:400});
    }
    return Response.json({entry});
  } catch(error) {
    if(error instanceof LocalGuideError){const status=error.code==='NOT_FOUND'?404:error.code==='STALE_VERSION'?409:400;return Response.json({error:error.message,code:error.code,currentVersion:error.currentVersion},{status});}
    console.error('Admin Local Guide action failed',error);return Response.json({error:'The Local Guide action could not be completed.'},{status:500});
  }
};
