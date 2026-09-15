let frame: HTMLIFrameElement | null = null;

export function printUrl(url: string) {
  if (frame) frame.remove();
  frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  const sep = url.includes('?') ? '&' : '?';
  frame.src = `${url}${sep}autoprint=1&embedded=1`;
  document.body.appendChild(frame);
}

export function openPrint(url: string) {
  window.open(url, '_blank', 'noopener');
}
