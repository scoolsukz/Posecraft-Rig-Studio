type Joint = { x: number; y: number; ex: number; ey: number; a: number };
type SkinBone = { id: string; length: number; width: number };

export function CharacterSkin({ bones, world }: { bones: SkinBone[]; world: Record<string, Joint> }) {
  return (
    <g className="pointer-events-none" aria-label="Friendly cartoon skeleton character">
      {bones.filter((bone) => bone.length > 0).map((bone) => {
        const joint = world[bone.id];
        if (!joint) return null;
        const { id, length } = bone;
        const isTorso = id === "spine" || id === "chest";
        const isHand = id.startsWith("hand");
        const isFoot = id.startsWith("foot");
        const width = isFoot ? 6 : bone.width * 0.4;
        if (id === "head") return (
          <g key={id} transform={`translate(${(joint.x + joint.ex) / 2} ${(joint.y + joint.ey) / 2}) rotate(${joint.a + 90})`}>
            <path d="M-32 -2 C-34 -25 -19 -36 0 -36 C22 -36 35 -23 32 -2 Q32 12 21 16 L20 25 Q0 34 -20 25 L-21 16 Q-32 12 -32 -2Z" className="fill-character-bone stroke-character-outline" strokeWidth="2" />
            {[-13, 13].map((x) => <g key={x}>
              <ellipse cx={x} cy="-7" rx="10" ry="12" className="fill-character-socket" />
            </g>)}
            <path d="M-5 5 Q0 -2 5 5 Q0 10 -5 5Z" className="fill-character-outline" />
            <ellipse cx="-24" cy="9" rx="5" ry="3" className="fill-character-cheek" />
            <ellipse cx="24" cy="9" rx="5" ry="3" className="fill-character-cheek" />
            <path d="M-15 15 Q0 28 15 15" className="fill-none stroke-character-ink" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        );
        if (isTorso) return (
          <g key={id} transform={`translate(${joint.x} ${joint.y}) rotate(${joint.a})`} className="fill-none" strokeLinecap="round" strokeLinejoin="round">
            <path d={`M0 0 H${length}`} className="stroke-character-outline" strokeWidth="10" />
            <path d={`M0 0 H${length}`} className="stroke-character-bone" strokeWidth="6" />
            {[0.25, 0.5, 0.75].map((t) => <path key={t} d={`M${length * t - 3} -5 V5`} className="stroke-character-outline" strokeWidth="1.3" />)}
            {id === "chest" && [13, 27, 41].map((x) => <g key={x}>
              <path d={`M${x} 0 C${x - 12} -29 ${x + 14} -31 ${x + 13} -4 M${x} 0 C${x - 12} 29 ${x + 14} 31 ${x + 13} 4`} className="stroke-character-outline" strokeWidth="8" />
              <path d={`M${x} 0 C${x - 12} -29 ${x + 14} -31 ${x + 13} -4 M${x} 0 C${x - 12} 29 ${x + 14} 31 ${x + 13} 4`} className="stroke-character-bone" strokeWidth="5" />
            </g>)}
            {id === "spine" && <>
              <path d="M5 0 C-12 -30 -25 -22 -17 -8 Q-8 4 -17 8 C-25 22 -12 30 5 0Z" className="fill-character-bone stroke-character-outline" strokeWidth="2" />
              <path d="M-12 -15 Q-20 -14 -14 -7 M-12 15 Q-20 14 -14 7" className="stroke-character-outline" strokeWidth="2" />
            </>}
          </g>
        );
        if (isHand) {
          const side = id.endsWith(".L") ? -1 : 1;
          const fingers = [
            { name: "index", points: [[14, -7], [23, -9], [30, -10], [35, -11]] },
            { name: "middle", points: [[16, -2], [26, -3], [34, -3], [40, -3]] },
            { name: "ring", points: [[15, 3], [24, 5], [31, 6], [36, 7]] },
            { name: "little", points: [[12, 7], [19, 11], [24, 14], [28, 16]] },
            // The thumb branches from the wrist side of the palm and bends
            // back toward the fingers, rather than forming a fifth parallel ray.
            { name: "thumb", points: [[5, -3], [9, -15], [16, -19], [21, -16]] },
          ];
          return (
            <g key={id} aria-label={`${id.endsWith(".L") ? "Left" : "Right"} skeleton hand`} transform={`translate(${joint.x} ${joint.y}) rotate(${joint.a})`}>
              <g transform={`scale(${length / 20} ${side * length / 20})`} strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="3" cy="0" rx="4" ry="5" className="fill-character-bone stroke-character-outline" strokeWidth="1.3" />
                {fingers.map(({ name, points }) => (
                  <g key={name} aria-label={name}>
                    {points.slice(1).map((point, index) => {
                      const start = points[index];
                      if (!start) return null;
                      return (
                        <g key={index}>
                          <path d={`M${start[0]} ${start[1]} L${point[0]} ${point[1]}`} className="stroke-character-outline" strokeWidth={index === 0 ? 4.6 : 4} />
                          <path d={`M${start[0]} ${start[1]} L${point[0]} ${point[1]}`} className="stroke-character-bone" strokeWidth={index === 0 ? 2.8 : 2.4} />
                        </g>
                      );
                    })}
                    {points.slice(0, -1).map(([x, y], index) => (
                      <circle key={index} cx={x} cy={y} r={index === 0 ? 2.3 : 1.9} className="fill-character-bone stroke-character-outline" strokeWidth="0.8" />
                    ))}
                  </g>
                ))}
                <path d="M2 -2 L14 -7 M3 0 L16 -2 M3 2 L15 3 M2 3 L12 7" className="fill-none stroke-character-outline" strokeWidth="3.6" />
                <path d="M2 -2 L14 -7 M3 0 L16 -2 M3 2 L15 3 M2 3 L12 7" className="fill-none stroke-character-bone" strokeWidth="2" />
              </g>
            </g>
          );
        }
        return (
          <g key={id} transform={`translate(${joint.x} ${joint.y}) rotate(${joint.a})`}>
            <path d={`M2 0 H${length - 2}`} className="stroke-character-outline" strokeWidth={width * 2 + 3} strokeLinecap="round" />
            <path d={`M2 0 H${length - 2}`} className="stroke-character-bone" strokeWidth={width * 2} strokeLinecap="round" />
            {[3, length - 3].map((x) => <g key={x}>
              <circle cx={x} cy={-width * 0.5} r={width * 0.8} className="fill-character-bone" />
              <circle cx={x} cy={width * 0.5} r={width * 0.8} className="fill-character-bone" />
            </g>)}
            {isFoot && <g aria-label={`${id.endsWith(".L") ? "Left" : "Right"} skeleton foot`}>
              <ellipse cx={length} cy="-2" rx="12" ry="6" className="fill-character-bone stroke-character-outline" strokeWidth="1.5" />
              {[-5.6, -3.2, -0.8, 1.6].map((y) => {
                const tip = length + 12 * Math.sqrt(1 - ((y + 2) / 6) ** 2);
                return <path key={y} d={`M${length + 4.5} ${y} Q${length + 7.5} ${y - 0.4} ${tip - 0.6} ${y}`} className="fill-none stroke-character-outline" strokeWidth="1.2" strokeLinecap="round" />;
              })}
            </g>}
          </g>
        );
      })}
    </g>
  );
}
