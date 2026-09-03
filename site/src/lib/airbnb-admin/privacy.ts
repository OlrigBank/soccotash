const ACCESS_CODE_VALUE = /(\b(?:access\s+code|door\s+code|key\s*box\s+code|lock\s*box\s+code|code(?:\s+for\s+(?:that|the)\s+(?:box|door))?)\s*(?:is|:|=)\s*)(?=[a-z0-9-]*\d)[a-z0-9-]{3,16}/giu;

export const AIRBNB_ACCESS_CODE_REDACTION = '[Access code redacted]';

/** Remove embedded access credentials before an admin read model is returned. */
export function redactAirbnbAccessCodes(value: string): string {
  return value.replace(ACCESS_CODE_VALUE, `$1${AIRBNB_ACCESS_CODE_REDACTION}`);
}
