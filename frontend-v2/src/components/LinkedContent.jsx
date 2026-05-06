const URL_REGEX = /https?:\/\/[^\s<>"']+/g;

function trimUrl(rawUrl) {
  let url = rawUrl;
  let trailing = '';

  while (/[),.;>\]]$/.test(url)) {
    trailing = url.slice(-1) + trailing;
    url = url.slice(0, -1);
  }

  return { url, trailing };
}

function formatUrlLabel(url) {
  try {
    const parsed = new URL(url);
    const fullLabel = `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`;
    return fullLabel.length > 52 ? `${fullLabel.slice(0, 49)}...` : fullLabel;
  } catch {
    return url.length > 52 ? `${url.slice(0, 49)}...` : url;
  }
}

export default function LinkedContent({ text, className = '' }) {
  const source = String(text || '');
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = URL_REGEX.exec(source)) !== null) {
    const rawUrl = match[0];
    const { url, trailing } = trimUrl(rawUrl);
    const start = match.index;

    if (start > lastIndex) {
      parts.push({
        type: 'text',
        value: source.slice(lastIndex, start)
      });
    }

    parts.push({
      type: 'link',
      value: url,
      trailing
    });

    lastIndex = start + rawUrl.length;
  }

  if (lastIndex < source.length) {
    parts.push({
      type: 'text',
      value: source.slice(lastIndex)
    });
  }

  return (
    <div className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${className}`.trim()}>
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return <span key={`text-${index}`}>{part.value}</span>;
        }

        return (
          <span key={`link-${index}`}>
            <a
              href={part.value}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 align-middle text-primary underline-offset-4 transition-colors hover:bg-primary/15 hover:text-white hover:underline"
              title={part.value}
            >
              <span className="truncate max-w-[min(28rem,70vw)] sm:max-w-[32rem]">
                {formatUrlLabel(part.value)}
              </span>
            </a>
            {part.trailing}
          </span>
        );
      })}
    </div>
  );
}
