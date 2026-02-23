export function extractStatusCode(message) {
  if (!message) {
    return null;
  }

  const match = message.match(/\b(?:error\s+code|http\s+error|status(?:\s+code)?)\s*[:=]?\s*(\d{3})\b/i);
  if (!match) {
    return null;
  }

  const code = Number(match[1]);
  return Number.isFinite(code) ? code : null;
}

export function shouldSkipOptionalOutput(message) {
  const code = extractStatusCode(message);
  return code !== null && code >= 500 && code <= 599;
}
