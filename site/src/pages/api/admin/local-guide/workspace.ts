import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../../lib/admin/auth.ts';
import { LocalGuideError } from '../../../../lib/local-guide/types.ts';
import { checkAllLocalGuideUrls, deleteLocalGuideCategory, moveLocalGuideCategory,
  publishLocalGuideWorkspace, saveLocalGuideCategory } from '../../../../lib/local-guide/workspace.ts';

export const prerender=false;
type Input=Record<string,unknown>;
const text=(value:unknown)=>String(value??'');
export const POST:APIRoute=async({request,locals})=>{
  if(!isSameOrigin(request))return Response.json({error:'Cross-site request forbidden.'},{status:403});
  const input=await request.json().catch(()=>null) as Input|null;
  if(!input)return Response.json({error:'A valid JSON request is required.'},{status:400});
  const actor={type:'administrator' as const,adminUserId:locals.adminUser!.id,source:'admin_local_guide_workspace'};
  try{
    const expectedWorkspaceVersion=Number(input.expectedWorkspaceVersion);
    switch(input.action){
      case'categorySave':return Response.json({workspaceVersion:await saveLocalGuideCategory({id:text(input.id),label:text(input.label),description:text(input.description),parentId:text(input.parentId).trim()||null,expectedWorkspaceVersion,actor})});
      case'categoryMove':return Response.json({workspaceVersion:await moveLocalGuideCategory({id:text(input.id),direction:text(input.direction) as'up'|'down',expectedWorkspaceVersion,actor})});
      case'categoryDelete':return Response.json({workspaceVersion:await deleteLocalGuideCategory({id:text(input.id),expectedWorkspaceVersion,actor})});
      case'publish':return Response.json({publicationVersion:await publishLocalGuideWorkspace({expectedWorkspaceVersion,acknowledgeWarnings:input.acknowledgeWarnings===true,actor})});
      case'checkUrls':return Response.json(await checkAllLocalGuideUrls({actor}));
      default:return Response.json({error:'Local Guide workspace action is invalid.'},{status:400});
    }
  }catch(error){if(error instanceof LocalGuideError)return Response.json({error:error.message,code:error.code,currentVersion:error.currentVersion},{status:error.code==='NOT_FOUND'?404:error.code==='STALE_VERSION'?409:400});console.error('Local Guide workspace action failed',error);return Response.json({error:'The Local Guide workspace action failed.'},{status:500})}
};
