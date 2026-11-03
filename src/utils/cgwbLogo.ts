// Official Central Ground Water Board (CGWB) Emblem and Issuing Offices Configuration

export const CGWB_ISSUING_OFFICES = [
  "CGWB, CHQ, Faridabad",
  "CGWB, NWHR, Jammu",
  "CGWB, NWR, Chandigarh",
  "CGWB, WR, Jaipur",
  "CGWB, WCR, Ahmedabad",
  "CGWB, NCR, Bhopal",
  "CGWB, NCCR, Raipur",
  "CGWB, CR, Nagpur",
  "CGWB, NR, Lucknow",
  "CGWB, MER, Patna",
  "CGWB, ER, Kolkata",
  "CGWB, NER, Guwahati",
  "CGWB, SER, Bhubaneswar",
  "CGWB, SR, Hyderabad",
  "CGWB, SWR, Bangalore",
  "CGWB, SECR, Chennai",
  "CGWB, KR, Trivandrum",
  "CGWB, NHR, Dharmshala",
  "CGWB, UR, Dehradun"
] as const;

export type CgwbIssuingOffice = typeof CGWB_ISSUING_OFFICES[number];

// Detailed office metadata for tooltips and regional lab mappings
export const CGWB_OFFICE_DETAILS: Record<string, { region: string; city: string; state: string }> = {
  "CGWB, CHQ, Faridabad": { region: "Central Headquarters", city: "Faridabad", state: "Haryana" },
  "CGWB, NWHR, Jammu": { region: "North Western Himalayan Region", city: "Jammu", state: "Jammu & Kashmir" },
  "CGWB, NWR, Chandigarh": { region: "North Western Region", city: "Chandigarh", state: "Punjab & Haryana" },
  "CGWB, WR, Jaipur": { region: "Western Region", city: "Jaipur", state: "Rajasthan" },
  "CGWB, WCR, Ahmedabad": { region: "West Central Region", city: "Ahmedabad", state: "Gujarat" },
  "CGWB, NCR, Bhopal": { region: "North Central Region", city: "Bhopal", state: "Madhya Pradesh" },
  "CGWB, NCCR, Raipur": { region: "North Central Chhattisgarh Region", city: "Raipur", state: "Chhattisgarh" },
  "CGWB, CR, Nagpur": { region: "Central Region", city: "Nagpur", state: "Maharashtra" },
  "CGWB, NR, Lucknow": { region: "Northern Region", city: "Lucknow", state: "Uttar Pradesh" },
  "CGWB, MER, Patna": { region: "Mid Eastern Region", city: "Patna", state: "Bihar & Jharkhand" },
  "CGWB, ER, Kolkata": { region: "Eastern Region", city: "Kolkata", state: "West Bengal & Odisha" },
  "CGWB, NER, Guwahati": { region: "North Eastern Region", city: "Guwahati", state: "Assam & North East" },
  "CGWB, SER, Bhubaneswar": { region: "South Eastern Region", city: "Bhubaneswar", state: "Odisha" },
  "CGWB, SR, Hyderabad": { region: "Southern Region", city: "Hyderabad", state: "Andhra Pradesh & Telangana" },
  "CGWB, SWR, Bangalore": { region: "South Western Region", city: "Bangalore", state: "Karnataka & Goa" },
  "CGWB, SECR, Chennai": { region: "South Eastern Coastal Region", city: "Chennai", state: "Tamil Nadu & Puducherry" },
  "CGWB, KR, Trivandrum": { region: "Kerala Region", city: "Trivandrum", state: "Kerala" },
  "CGWB, NHR, Dharmshala": { region: "Northern Himalayan Region", city: "Dharmshala", state: "Himachal Pradesh" },
  "CGWB, UR, Dehradun": { region: "Uttarakhand Region", city: "Dehradun", state: "Uttarakhand" }
};

// Official Vector CGWB Circular Emblem with Government of India Lion Capital & Water Elements
export const CGWB_EMBLEM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="cgwbNavyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f2b48" />
      <stop offset="50%" stop-color="#0b3b60" />
      <stop offset="100%" stop-color="#072038" />
    </linearGradient>
    <linearGradient id="cgwbGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24" />
      <stop offset="50%" stop-color="#d97706" />
      <stop offset="100%" stop-color="#92400e" />
    </linearGradient>
    <linearGradient id="cgwbWaterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="60%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#0369a1" />
    </linearGradient>
    <path id="topTextArc" d="M 32,100 A 68,68 0 0,1 168,100" fill="none" />
    <path id="bottomTextArc" d="M 168,100 A 68,68 0 0,1 32,100" fill="none" />
  </defs>

  <!-- Outer Ring Shadow and Border -->
  <circle cx="100" cy="100" r="98" fill="none" stroke="#d97706" stroke-width="2.5" />
  <circle cx="100" cy="100" r="95" fill="url(#cgwbNavyGrad)" stroke="#b45309" stroke-width="2" />
  
  <!-- Outer Ring Gold Fillet -->
  <circle cx="100" cy="100" r="77" fill="none" stroke="url(#cgwbGoldGrad)" stroke-width="2" />
  
  <!-- Curved Text on Outer Navy Ring -->
  <text font-family="'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif" font-size="9" font-weight="900" fill="#fef08a" letter-spacing="1.5">
    <textPath href="#topTextArc" startOffset="50%" text-anchor="middle">
      केन्द्रीय भूमि जल बोर्ड
    </textPath>
  </text>
  <text font-family="'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif" font-size="8" font-weight="900" fill="#ffffff" letter-spacing="1">
    <textPath href="#bottomTextArc" startOffset="50%" text-anchor="middle">
      CENTRAL GROUND WATER BOARD
    </textPath>
  </text>

  <!-- Star accents on sides -->
  <polygon points="26,100 28,102 30,100 28,98" fill="#fbbf24" />
  <polygon points="170,100 172,102 174,100 172,98" fill="#fbbf24" />

  <!-- Inner Center Shield / Circle -->
  <circle cx="100" cy="100" r="74" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" />

  <!-- Water Wave Base inside Circle -->
  <clipPath id="innerCircleClip">
    <circle cx="100" cy="100" r="73.5" />
  </clipPath>

  <g clip-path="url(#innerCircleClip)">
    <!-- Water Waves Background -->
    <path d="M 20,122 Q 60,112 100,122 T 180,122 L 180,180 L 20,180 Z" fill="#e0f2fe" opacity="0.6" />
    <path d="M 20,132 Q 55,124 100,132 T 180,132 L 180,180 L 20,180 Z" fill="url(#cgwbWaterGrad)" opacity="0.85" />
    <path d="M 20,144 Q 65,138 100,144 T 180,144 L 180,180 L 20,180 Z" fill="#0369a1" />

    <!-- Pure Water Droplet in Center -->
    <path d="M 100,56 C 100,56 82,78 82,92 C 82,102 90,110 100,110 C 110,110 118,102 118,92 C 118,78 100,56 100,56 Z" 
          fill="url(#cgwbWaterGrad)" stroke="#0284c7" stroke-width="1.5" />
    <!-- Droplet Glint / Reflection -->
    <ellipse cx="94" cy="88" rx="3" ry="7" fill="#ffffff" opacity="0.75" transform="rotate(-25 94 88)" />

    <!-- Ashoka Lion Capital / Emblem Silhouette in Gold -->
    <path d="M 94,42 L 106,42 L 104,50 L 96,50 Z M 92,50 L 108,50 L 107,53 L 93,53 Z" fill="#d97706" />
    <circle cx="100" cy="38" r="4" fill="#d97706" />
    
    <!-- Dharma Chakra 24-spoke wheel element -->
    <circle cx="100" cy="100" r="6" fill="none" stroke="#ffffff" stroke-width="1.2" />
    <circle cx="100" cy="100" r="1.5" fill="#ffffff" />

    <!-- Wave Ripple lines -->
    <path d="M 50,158 Q 75,152 100,158 T 150,158" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6" />
    <path d="M 60,168 Q 80,164 100,168 T 140,168" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.5" />
  </g>

  <!-- Subtitle Ribbon at Base -->
  <rect x="52" y="156" width="96" height="15" rx="4" fill="#0b3b60" stroke="#d97706" stroke-width="1" />
  <text x="100" y="167" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="7" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">
    GOVT. OF INDIA
  </text>
</svg>`;

export const svgToPngDataUrl = (svgString: string, width = 300, height = 300): Promise<string> => {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const pngUrl = canvas.toDataURL('image/png');
          URL.revokeObjectURL(url);
          resolve(pngUrl);
          return;
        }
        URL.revokeObjectURL(url);
        resolve(DEFAULT_CGWB_PNG_BASE64);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(DEFAULT_CGWB_PNG_BASE64);
      };
      img.src = url;
    } catch {
      resolve(DEFAULT_CGWB_PNG_BASE64);
    }
  });
};

export const DEFAULT_CGWB_PNG_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAACgCAYAAACLz2ctAAAM4ElEQVR42u2dP0gkTxbHe+8S5VAjFd1cDkEwv02WNTKQDYRNFvxhIIjCwnDIBoIbCCIoHIyR2XHBBJqYLA6ajMmBCLuRcIuBgpGTiNFwDPyuivsKfX3d09XV73V3db0Hj+WnY091vc/vvfrz6lUQiIiIiIiIWMmf/vKbdIIIKVDDSt8qnVP6Tumi0k9KV5VuKG0o/ap0W+mO0m/4dxs/b+Bzq/i7RTxnDs8dll4WeYVtTOms0gWlnwHPntJjpadKL5VeK71V+qD0SemL0p7SvtLfr47//Lv+F//dw++f8Plb/P0lnneM5zfwfQv4/jGxhh/AjSqdV/pR6RelB0pbSjtKfyl91kBxq/4efF8H33+A9nxE+0bFWvWBblrpe6VrSvfhiW6UdolgooKyi3adop1raPe0WNE96MZhPD0Wayq9UHpvChS3GrbjHu1u4j30+4yLdSs8G0X4WlF6qLSt9LFs2Cig1O+B9znE+83L7LtaE4kPSrcwnrp1BTpLGG/xnlt4b5nAlATepNIlpbtKz5PGdC4AZwMkxozneH/dD5NCRTHgTWC2uI9ZZK+u4BmC2EM/7KNfJoQSHvBGsKir19Gu9LqbD9CZwoh1yCv0j+6nEaGGDr532Gm4iPN4PoFnAGIP/aT7653Qkw+8GaXrSk/ixng+g2cAYhf9pvtvRmjKBt4QBtbNuFmtAJcJxFv0o+7PIaErHb5Z7JW2ox1aRYP/6x/TlQcRP2ujX2eFsmT4FvF/612ZXk9DxaUle8M79O+i0Pa/4E1h7/MsOrt1HbgqABkzWz5Df08JfP/dVtL5dDdFeb0ygSsLyJi+vUG/z/sMn86HO4ru2boEnRaXYIzZY9b9v+AbeG+ULmNPs8cJXx6wqKUqIMasG7Zgjze+7GjodPXvXCG3SNh6/+4XCiVjSP4Ou4zUGT6dp7ep9y7LBs8ELGqlhJHJG3Zgn/E6wjeNdajrsuArEra8UJYI4TXsNF0n+N4if+0HNXy24JUJXRYYiwIxYpcfsNfbung+/TI/KeGrC3SUMBJD+BN2m3Z9zNeg9nx1Bi8viAyesOHkmBCz3U3KMV9Wr+cyeGkgcnrDmDHhplOzY6zzrVLOdn0FLw+IxLPjVWfWCbGo+Z0bPp/AswWREEK9TrjsyvZaiwI+U6/nE3iDQOTwhhE7tiq9bYfEgqPw9lrdvd4f1/9ee28Y2bY7qmQCA1KqdsKJBT6E3CoAWDCEj7DzVNUAXIumVHHBV5Xwp+F7VZdCMkEo1qlca1XLZD7zFT5PITyrRGY1znA0w5nMPsLnG4TIrG6WesYEp9ca4TMcPsPnIYR3sP9QWQDqo37tPKE3Db4qLXmYwFc1CMMgUkEYsbc+bbdUBnwzcMECn8cQ4r+bhR9+x4n7W+rQWxf4XIMwZyjWh9/Xi4RP12o5oQ69ro756jImzBmKTwqpRYMsl+1wrRaBTyBELZpt9qwZrPldCHwCYQyEF6xrgygOuZdnr9fFpIK6jAFNIcy5V7zHViQTFTivOLxfHeFzBUJiL6iLZH7kgG8SZWCtdjxcTKmqY/jlCsWRHZJ98prVWHTuSOiVUGwAYYd0cRpXIezajv18Db2+heLIWHCX7AoJ3EdxTu39qpxp7BOAgyDM4QX1FRIfKOALcD6064v3EwBJvGAX3JCk2bd8gs9HAJkgbOVO38fdZLcUALpykIgDPpe8YN5QHNkjXslb2eDQZs/XZe/nqwek8oIRXg6tKyvgitC2T95PACT3gjpf8L0tgBu2p9xc9n4+A0g1I46cotuwrWrV9G3yIQCyTEaamatsIfxe+Oj9fNoJKcgLXmQOwzjne+/b5EMApJ+MaI4ynSNWHx7VG8oUs1/X67f4CB+VF4zwoxMURrMsPp/6HH7rng9YQhg+NV6URt7fjc/ht26n4ioQhm+M8wTVB7/Y7P2mwfeH3X+malmdbdK2sJYFXpY2VikMY2/4i2nq1QFH+C268zjA862dxGH4IDVFC7VeWmUDyGngvMb0qZ3EALZSa8mgwmmHY/ZbtpE5DOpDOwnDcCe1wqr6wGelv8oY/3EZuCiD5mlnWW00aSchgL80X2kA6mpHz1UGULRYMAkBfNZ8DYJvWJ/rrMr4L05H//q3gVqkgarSDq62MI0D9bnh4UF3uh1zrP9xg1cUAFnb4XJbmNYDjxPvoFO/mLPZAeGCz6aDuQCoW1tKDMN6R2RuUNWry7IBpDI2hfF9bwsDgJeJVbRQeOiaGkCTF+XqXJtOl7awAnidWMBI/eKTzQEkUwBF3VMGAPVBpU9JAOoL6R4EQFFGAB80Z4POgDwJgKKMAD4lnhHBIvSLACjKCOBL4mK0+sVXmwJEAqAAmLFw0dckALdt6v8JgAJgxvqB20kA7tjc+yEACoAZ7xXZSaqC9Y0jDUsM6T6AxBB+i62aJR5QtDQPKGNA0SqMAWUWLFrqLFjWAUVLXQeUnRDRUndCZC9YtNS9YMmGES01G4Y1H1BUAEzLB2TJiBZDCoCmGdEsZ0LEkAKg6ZkQtlNxYsz6wcdxKo7tXLAY1F/vZ3wumLMyghhUwm9qZQTO2jBiUAHQtDYMW3UsMar3aVhG1bHY6gOKYb0f/xnVB2SrkCqG9R7A9AqpnDWixbBej//MakRzV8kX43q7/pepSj7bPSFiYG/Db6Z7QlhvShIj+zX7zXxTEvddcWJo78JvtrviuG/LFEN7F36tbstkvS9YjF1v75f7vmDuG9PF4N54P7sb00NhuE0JoEDoBnyEALYzh98QgONKDylmw+IF/Zt8gJdDzVFgK+qPV2wOKokXFO+HA0grQR7BonSLazIiEFZ/3S9n8sF8XgC1btnsDUso9nrm2wU3QW5RD/mg9NwGQNkd8WPXIwbAc81NQCFI0dq1KVwkodjL0NsDL2MBlaiHLdlkSsuExI+JR0zm81JAKeqBk9hQ7lN7QYGwevDl8H59cDIZUAvyBK+ovKCE4nqE3giAV8Z5fxYATuBcZ48zFAuExcFHHHp74GMi4BIUMLrg8IISit0LvTFZL4sBp6gvGEEt6a5AKPBF1v00FyMBt6CK1onNHrFAWD/4YP+TxKpXTBCu2+4Ry6TE/UlHzJ7velCkqC+cQaIhqRcUCIuHL2fofU04nQmKFixOt6lDsUDoBnyhfL+loAxRXzyEalp31KFYlmh4l1qIQu8d7D8UlCWoJdO03SERCJ2Frw+7zwZlC9YGz/KEYoHQHfhg3zP2Nb+MEK6Fy3kUBaHvIEb7oiD4bjKf8y0AwCnctvmYB0BTCMUbJns9avhiTrlpO08FVROk7x/l2SvOA6EvIA7yeszw9WDf+aCqggqrrbyheBCEPodkm5BLAV/ojMdCUHVRjVxW+p0CQvGG5Xi9GPi+a7sGLohq6BtcfNjhhrDuINqCRwxfB/Z8E7giyJrZDN89xwmhCYiuwBjX7izgEcN3DTuOBK4JKivolfIfVBBm9YYugWgCHqfXi4HvB+w3HrgqqLKlz4f+LArCLCCWCeSg9mQFjwG+n7DbdOC64A66LWpPaAKiDYxcQKZ9pw10FOAleL6txDvdHPaEDcoxIQWIJjByapIUBV7CmK9RC8+XMCbcpJwdZ4UwDUZOKNMkS/uZ4OvAPuNBXQWz49XoOmFZIJrAmAZqHsnaVg7wQut8q07Odi3XCZexst7jgNAWRgooqWCjhi7B6/Vgh2Wn1vkIt+2OwgkMHBDmAdEEVK5nc/RDpJ8f0f8Lga+CBIadaCoXF4icMFYVuoSQe4N+nw98F6RyrSHJsV8EhFUBsoj3i/RnH/28VsmUqgpkVjfDZ0yKBLEIIIt8j5g+vEP/Lgptg8+YNHDaqjQIs8BaxXbF9Fsb/TorlKVDOIQjn83w4fcqg1hF8EKHxpvozyGhKxuIM6jAcBKuRSMgGoHXRb+tl3JovGYgvkPhm4vouqHvIMb0RQ/9tF1orRYPIBzBJGUPRRD7PoMY8+599Mse+mlEqOEBcQKVWvexd/l/HrGuMCa8Zw/9sI9+mRBKigFxEgPrXVwJ0K0riAnv1cV776IfJoWKckAcwz0mW9jTvI0zmEtAprT/Fu+5hfceEwqqAeLrtt4KLshrR/eYqwxjSjsf8T6HeL95khuIRNhgHMdVsxtYA9OzwvtBRi4SSsN23KPdTbzH+1rn6dUYxmkYbw0D9VNsxHdNQDABlug5XbTrFO1cQ7unxYr1gXEU4UvPFr8oPcB4Ss8ifyl9poDJALZnfF8H33+A9nxE+0bFWv5MYGaRl/gZe6V6He0YnugSZyT0wP9B6ZPSFyx99F+9H0JrHz9/wece8HfXeM4pnruH7/mM752ViYRIGMphnOKbww6MXtT9hHT1DcDzFTsNOp/uG/7dxs8b+Nwq/m4Rz5nDc4ell0VIZ98iIiKOyn8AgQsb/XjZ/qsAAAAASUVORK5CYII=";
