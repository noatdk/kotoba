/* eslint react/no-array-index-key: 0 */

import React, {
  useMemo, useEffect, useRef, useState,
} from 'react';
import PropTypes from 'prop-types';
import ReactMarkdown from 'react-markdown';

function intToHex(color) {
  if (!color) return '#7289da';
  return `#${color.toString(16).padStart(6, '0')}`;
}

function resolveImageSrc(embed, attachments) {
  if (!embed.image) return null;
  const { url } = embed.image;

  if (url && url.startsWith('attachment://')) {
    const filename = url.replace('attachment://', '');
    const att = (attachments || []).find((a) => a.filename === filename);
    if (att) {
      if (att.binary) {
        const blob = new Blob([att.file], { type: 'image/png' });
        return URL.createObjectURL(blob);
      }
      if (att.encoding === 'base64') {
        return `data:image/png;base64,${att.file}`;
      }
    }
  }

  return url || null;
}

function linkRenderer({ href, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

function Md({ text }) {
  if (!text) return null;

  // Handles underline markdown
  if (text.includes('__')) {
    const html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/__(.+?)__/g, '<u>$1</u>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, href) => {
        if (/^(javascript|data|vbscript):/i.test(href)) return linkText;
        if (/["'<>]/.test(href)) return linkText;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
      })
      .replace(/\n/g, '<br/>');
    // eslint-disable-next-line react/no-danger
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return (
    <ReactMarkdown
      components={{ a: linkRenderer }}
      linkTarget="_blank"
      breaks
    >
      {text}
    </ReactMarkdown>
  );
}

function EmbedImage({
  src, onLoad, intrinsicWidth, intrinsicHeight,
}) {
  const [status, setStatus] = useState('loading');
  const [probedSize, setProbedSize] = useState(null);

  useEffect(() => {
    setStatus('loading');
    setProbedSize(null);
    if (intrinsicWidth && intrinsicHeight) return undefined;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setProbedSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src, intrinsicWidth, intrinsicHeight]);

  const handleLoad = () => {
    setStatus('loaded');
    if (onLoad) onLoad();
  };

  const handleError = () => {
    setStatus('error');
    if (onLoad) onLoad();
  };

  if (status === 'error') {
    return (
      <div className="bot-embed-image-error">Image failed to load</div>
    );
  }

  const fromServer = intrinsicWidth > 0 && intrinsicHeight > 0;
  const rawW = fromServer ? intrinsicWidth : probedSize?.w;
  const rawH = fromServer ? intrinsicHeight : probedSize?.h;
  const sizeUnknown = !rawW || !rawH;
  const cls = `bot-embed-image${status !== 'loaded' ? ' loading' : ''}${
    sizeUnknown ? ' bot-embed-image--unknown-size' : ''}`;

  return (
    <div className={cls}>
      <img
        src={src}
        alt=""
        width={sizeUnknown ? undefined : rawW}
        height={sizeUnknown ? undefined : rawH}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}

EmbedImage.propTypes = {
  src: PropTypes.string.isRequired,
  onLoad: PropTypes.func,
  intrinsicWidth: PropTypes.number,
  intrinsicHeight: PropTypes.number,
};

EmbedImage.defaultProps = {
  onLoad: undefined,
  intrinsicWidth: undefined,
  intrinsicHeight: undefined,
};

function Embed({ embed, attachments, onImageLoad }) {
  const color = intToHex(embed.color);
  const blobUrlRef = useRef(null);
  const imageSrc = useMemo(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    const src = resolveImageSrc(embed, attachments);
    if (src && src.startsWith('blob:')) {
      blobUrlRef.current = src;
    }
    return src;
  }, [embed, attachments]);

  useEffect(() => () => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
  }, []);

  const iw = embed.image?.width;
  const ih = embed.image?.height;
  const iwN = Number(iw);
  const ihN = Number(ih);
  const hasServerDims = Number.isFinite(iwN) && Number.isFinite(ihN);

  return (
    <div className="bot-embed" style={{ borderLeftColor: color }}>
      {embed.title && (
        <div className="bot-embed-title">
          {embed.url
            ? <a href={embed.url} target="_blank" rel="noopener noreferrer">{embed.title}</a>
            : embed.title}
        </div>
      )}
      {embed.description && (
        <div className="bot-embed-description">
          <Md text={embed.description} />
        </div>
      )}
      {embed.fields && embed.fields.length > 0 && (
        <div className="bot-embed-fields">
          {embed.fields.map((field, i) => (
            <div key={i} className={`bot-embed-field${field.inline ? ' inline' : ''}`}>
              <div className="bot-embed-field-name"><Md text={field.name} /></div>
              <div className="bot-embed-field-value"><Md text={String(field.value)} /></div>
            </div>
          ))}
        </div>
      )}
      {imageSrc && (
        <EmbedImage
          src={imageSrc}
          intrinsicWidth={hasServerDims ? iwN : undefined}
          intrinsicHeight={hasServerDims ? ihN : undefined}
          onLoad={onImageLoad}
        />
      )}
      {embed.footer && (
        <div className="bot-embed-footer"><Md text={embed.footer.text} /></div>
      )}
    </div>
  );
}

Embed.propTypes = {
  embed: PropTypes.shape({
    title: PropTypes.string,
    description: PropTypes.string,
    url: PropTypes.string,
    color: PropTypes.number,
    fields: PropTypes.arrayOf(PropTypes.shape({
      name: PropTypes.string,
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      inline: PropTypes.bool,
    })),
    image: PropTypes.shape({
      url: PropTypes.string,
      width: PropTypes.number,
      height: PropTypes.number,
    }),
    footer: PropTypes.shape({ text: PropTypes.string }),
  }).isRequired,
  attachments: PropTypes.arrayOf(PropTypes.shape({
    filename: PropTypes.string,
    file: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    binary: PropTypes.bool,
    encoding: PropTypes.string,
  })),
  onImageLoad: PropTypes.func,
};

Embed.defaultProps = {
  attachments: [],
  onImageLoad: undefined,
};

Md.propTypes = {
  text: PropTypes.string,
};

Md.defaultProps = {
  text: '',
};

export default Embed;
export { Md };
