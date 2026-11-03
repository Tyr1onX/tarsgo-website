/** An idea takes shape: open construction lines resolve into a solid, interlocking form. */
export function SalonArtwork() {
  return (
    <svg className="salon-artwork" viewBox="0 0 480 400" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="0.8" opacity="0.2">
        <path d="m20 250 220-127 220 127-220 127Zm0-64 220-127 220 127M20 314 240 187l220 127M130 59v254m220-254v254M240 20v360" />
        <path d="m75 90 330 191M75 154l330 191M75 218l330 191M75 281l330-191" strokeDasharray="3 7" />
      </g>
      <g stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
        <path d="m88 169 86-50 86 50-86 50Zm0 0v100l86 50 86-50V169m-86 50v100" opacity="0.35" />
        <path d="m174 119 86-50 86 50-86 50Z" fill="var(--salon-art-top)" />
        <path d="m174 119 86 50v100l-86-50Z" fill="var(--salon-art-side)" />
        <path d="m260 169 86-50v100l-86 50Z" fill="var(--salon-art-front)" />
        <path d="m260 269 86-50 86 50-86 50Z" fill="var(--salon-art-top)" />
        <path d="m260 269 86 50v50l-86-50Z" fill="var(--salon-art-side)" />
        <path d="m346 319 86-50v50l-86 50Z" fill="var(--salon-art-front)" />
        <path d="m174 219 86-50 86 50-86 50Z" opacity="0.45" />
        <path d="M88 169 52 148m208-79V28m172 291 28 16" strokeDasharray="3 5" opacity="0.6" />
      </g>
      <g fill="currentColor">
        <circle cx="52" cy="148" r="3" /><circle cx="260" cy="28" r="3" /><circle cx="460" cy="335" r="3" />
        <circle cx="88" cy="269" r="2" /><circle cx="174" cy="319" r="2" />
      </g>
    </svg>
  );
}
