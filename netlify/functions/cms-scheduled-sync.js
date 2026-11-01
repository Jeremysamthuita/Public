import {runCmsSync, supportedContentTypes} from './_shared/cms-sync-core.js';

export const config = {schedule: '0 */6 * * *'};

export const handler = async () => {
  try {
    const result = await runCmsSync(supportedContentTypes());
    if (result.failures.length) {
      console.error('[cms-scheduled-sync] Some content types failed.', result.failures);
      return {statusCode: 502, body: JSON.stringify(result)};
    }
    return {statusCode: 200, body: JSON.stringify(result)};
  } catch (error) {
    console.error('[cms-scheduled-sync] Reconciliation failed.', error);
    return {statusCode: 500, body: JSON.stringify({error: error.message})};
  }
};
