// Bottle.jsx — luxe product silhouettes (SVG) with brand-specific labels.
// variants: flacon · apothecary · dropper · jar · tube · compact · tall

function Bottle({
  variant = "flacon",
  liquid = "#6b4423",
  liquidTop = "#d8c89c",
  capColor = "#18120E",
  brand = { name: "MAISON", font: "Italiana, serif", case: "upper", accent: "#6B1E3F", tagline: "" },
  product = { name: "", category: "", size: "" },
}) {
  const liquidId = "liq-" + Math.random().toString(36).slice(2, 8);
  const glassId  = "gls-" + Math.random().toString(36).slice(2, 8);
  const highlightId = "hl-" + Math.random().toString(36).slice(2, 8);

  const word = brand.case === "title" ? brand.name : brand.name.toUpperCase();
  const wordSpacing = brand.case === "title" ? 0 : 3;
  const accent = brand.accent || "#6B1E3F";

  const defs = (
    <defs>
      <linearGradient id={liquidId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stopColor={liquidTop} stopOpacity="0.95" />
        <stop offset="55%" stopColor={liquid}    stopOpacity="0.96" />
        <stop offset="100%" stopColor={liquid}   stopOpacity="1" />
      </linearGradient>
      <linearGradient id={glassId} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.05" />
        <stop offset="35%" stopColor="#ffffff" stopOpacity="0.20" />
        <stop offset="65%" stopColor="#ffffff" stopOpacity="0.04" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0.22" />
      </linearGradient>
      <linearGradient id={highlightId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.65" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
    </defs>
  );

  const Label = ({ x, y, w, h, s = 1 }) => {
    const cx = x + w / 2;
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill="var(--paper)" opacity="0.97" />
        <rect x={x} y={y} width={w} height={h} fill="none" stroke="rgba(0,0,0,0.08)" />
        <text x={cx} y={y + 28 * s}
              textAnchor="middle"
              fontFamily={brand.font}
              fontSize={22 * s}
              fill="#18120E" letterSpacing={wordSpacing}>
          {word}
        </text>
        <line x1={cx - 30 * s} y1={y + 36 * s} x2={cx + 30 * s} y2={y + 36 * s}
              stroke={accent} strokeWidth="0.6" />
        {brand.tagline && (
          <text x={cx} y={y + 48 * s} textAnchor="middle"
                fontFamily="Manrope, sans-serif" fontSize={5 * s}
                letterSpacing="2" fill="#897662">{brand.tagline}</text>
        )}
        {product.name && (
          <text x={cx} y={y + 70 * s} textAnchor="middle"
                fontFamily="Cormorant Garamond, serif" fontStyle="italic"
                fontSize={13 * s} fill={accent}>{product.name}</text>
        )}
        {product.category && (
          <text x={cx} y={y + 86 * s} textAnchor="middle"
                fontFamily="Manrope, sans-serif" fontSize={5 * s}
                letterSpacing="2" fill="#45382E">{product.category}</text>
        )}
        {product.size && (
          <text x={cx} y={y + 100 * s} textAnchor="middle"
                fontFamily="Manrope, sans-serif" fontSize={5 * s}
                letterSpacing="2" fill="#897662">{product.size}</text>
        )}
      </g>
    );
  };

  if (variant === "apothecary") {
    return (
      <svg className="bottle" viewBox="0 0 220 320" xmlns="http://www.w3.org/2000/svg">
        {defs}
        <rect x="92" y="6" width="36" height="14" rx="2" fill={capColor} />
        <rect x="86" y="20" width="48" height="10" rx="2" fill={capColor} opacity="0.86" />
        <rect x="98" y="30" width="24" height="20" fill={capColor} />
        <path d="M70 60 Q70 50 80 50 L140 50 Q150 50 150 60 L150 70 L70 70 Z" fill={`url(#${glassId})`} stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />
        <rect x="40" y="70" width="140" height="230" rx="22" fill={`url(#${glassId})`} stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />
        <rect x="46" y="100" width="128" height="194" rx="18" fill={`url(#${liquidId})`} opacity="0.92" />
        <Label x={58} y={140} w={104} h={120} />
        <rect x="52" y="80" width="10" height="200" rx="5" fill={`url(#${highlightId})`} opacity="0.5" />
      </svg>
    );
  }

  if (variant === "dropper") {
    return (
      <svg className="bottle" viewBox="0 0 180 360" xmlns="http://www.w3.org/2000/svg">
        {defs}
        <rect x="64" y="6" width="52" height="46" rx="3" fill={capColor} />
        <rect x="60" y="52" width="60" height="8" rx="2" fill={capColor} opacity="0.86" />
        <rect x="74" y="60" width="32" height="20" fill={`url(#${glassId})`} stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />
        <rect x="36" y="80" width="108" height="270" rx="14" fill={`url(#${glassId})`} stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />
        <rect x="42" y="110" width="96" height="234" rx="10" fill={`url(#${liquidId})`} opacity="0.92" />
        <rect x="86" y="80" width="8" height="180" fill="rgba(0,0,0,0.35)" />
        <ellipse cx="90" cy="262" rx="6" ry="8" fill={liquid} />
        <Label x={44} y={160} w={92} h={130} s={0.9} />
        <rect x="46" y="90" width="8" height="240" rx="4" fill={`url(#${highlightId})`} opacity="0.55" />
      </svg>
    );
  }

  if (variant === "jar") {
    return (
      <svg className="bottle" viewBox="0 0 260 240" xmlns="http://www.w3.org/2000/svg">
        {defs}
        <rect x="40" y="10" width="180" height="46" rx="4" fill={capColor} />
        <rect x="40" y="50" width="180" height="6" fill={capColor} opacity="0.85" />
        <text x="130" y="40" textAnchor="middle" fontFamily={brand.font} fontSize="20"
              fill={accent} letterSpacing={wordSpacing + 2}>{word}</text>
        <rect x="20" y="58" width="220" height="170" rx="14" fill={`url(#${glassId})`} stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />
        <rect x="28" y="78" width="204" height="142" rx="10" fill={`url(#${liquidId})`} opacity="0.9" />
        <Label x={56} y={108} w={148} h={88} s={0.88} />
        <rect x="28" y="68" width="10" height="150" rx="5" fill={`url(#${highlightId})`} opacity="0.45" />
      </svg>
    );
  }

  if (variant === "tube") {
    return (
      <svg className="bottle" viewBox="0 0 160 360" xmlns="http://www.w3.org/2000/svg">
        {defs}
        <rect x="50" y="0" width="60" height="22" rx="2" fill={capColor} />
        <rect x="44" y="22" width="72" height="8" rx="2" fill={capColor} opacity="0.85" />
        <path d="M30 30 L130 30 L120 354 L40 354 Z" fill={liquidTop} stroke="rgba(0,0,0,0.16)" strokeWidth="0.6" />
        <Label x={42} y={100} w={76} h={150} s={0.72} />
        <rect x="36" y="40" width="8" height="300" rx="4" fill={`url(#${highlightId})`} opacity="0.5" />
      </svg>
    );
  }

  if (variant === "compact") {
    return (
      <svg className="bottle" viewBox="0 0 280 260" xmlns="http://www.w3.org/2000/svg">
        {defs}
        <ellipse cx="140" cy="130" rx="124" ry="118" fill={`url(#${glassId})`} stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />
        <ellipse cx="140" cy="130" rx="124" ry="118" fill={liquidTop} opacity="0.95" />
        <ellipse cx="140" cy="130" rx="104" ry="98" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.7" />
        <text x="140" y="126" textAnchor="middle" fontFamily={brand.font} fontSize="26"
              fill="#18120E" letterSpacing={wordSpacing}>{word}</text>
        <line x1="106" y1="140" x2="174" y2="140" stroke={accent} strokeWidth="0.7" />
        {product.name && (
          <text x="140" y="160" textAnchor="middle" fontFamily="Cormorant Garamond, serif"
                fontStyle="italic" fontSize="14" fill={accent}>{product.name}</text>
        )}
        {product.category && (
          <text x="140" y="176" textAnchor="middle" fontFamily="Manrope, sans-serif"
                fontSize="6" letterSpacing="2.4" fill="#45382E">{product.category}</text>
        )}
      </svg>
    );
  }

  if (variant === "tall") {
    return (
      <svg className="bottle" viewBox="0 0 160 400" xmlns="http://www.w3.org/2000/svg">
        {defs}
        <rect x="62" y="4" width="36" height="40" rx="2" fill={capColor} />
        <rect x="58" y="44" width="44" height="8" rx="2" fill={capColor} opacity="0.85" />
        <rect x="40" y="52" width="80" height="346" rx="6" fill={`url(#${glassId})`} stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />
        <rect x="46" y="76" width="68" height="316" rx="4" fill={`url(#${liquidId})`} opacity="0.92" />
        <Label x={50} y={150} w={60} h={170} s={0.55} />
        <rect x="44" y="62" width="6" height="320" rx="3" fill={`url(#${highlightId})`} opacity="0.55" />
      </svg>
    );
  }

  // flacon (default)
  return (
    <svg className="bottle" viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg">
      {defs}
      <rect x="86" y="6" width="68" height="50" rx="2" fill={capColor} />
      <rect x="80" y="56" width="80" height="10" rx="2" fill={capColor} opacity="0.85" />
      <rect x="106" y="66" width="28" height="18" fill={`url(#${glassId})`} stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />
      <path d="M40 90 Q40 84 50 84 L190 84 Q200 84 200 90 L200 100 L40 100 Z" fill={`url(#${glassId})`} stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />
      <rect x="32" y="100" width="176" height="250" rx="10" fill={`url(#${glassId})`} stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />
      <rect x="40" y="124" width="160" height="218" rx="8" fill={`url(#${liquidId})`} opacity="0.92" />
      <line x1="42" y1="120" x2="42" y2="346" stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" />
      <line x1="198" y1="120" x2="198" y2="346" stroke="rgba(0,0,0,0.18)" strokeWidth="0.8" />
      <Label x={58} y={160} w={124} h={148} s={1.1} />
      <rect x="46" y="110" width="10" height="226" rx="5" fill={`url(#${highlightId})`} opacity="0.55" />
    </svg>
  );
}

window.Bottle = Bottle;
