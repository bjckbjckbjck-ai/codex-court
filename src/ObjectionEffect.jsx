import React, { useEffect, useRef } from 'react';

export const EFFECTS = {
  object: { text: '异议！', en: 'OBJECTION!', caption: '让证据，推翻既定结论。' },
  press: { text: '等一下！', en: 'HOLD IT!', caption: '这句话，还需要一个解释。' },
  present: { text: '看这份证据！', en: 'TAKE THAT!', caption: '关键的线索，就在这里。' },
  verify: { text: '要求验证！', en: 'CHECK THE FACTS!', caption: '让每一个判断，都有据可循。' },
};
export function ObjectionEffect({ effect }) {
  const ref = useRef(null);
  useEffect(() => {
    // A manual popover sits above the settings dialog without stealing focus.
    if (effect) ref.current?.showPopover();
    else if (ref.current?.matches(':popover-open')) ref.current.hidePopover();
  }, [effect]);
  const scene = EFFECTS[effect?.kind] || EFFECTS.object;
  return <div ref={ref} popover="manual" className={`court-impact impact-${effect?.kind || 'object'}`} data-testid="court-impact" role="status" aria-live="polite" aria-atomic="true">
    {effect && <div key={effect.key} className="impact-scene">
      <div className="impact-shade"/><div className="impact-speed"/>
      <div className="impact-bubble"><div className="impact-words"><span>{scene.en}</span><strong>{scene.text}</strong></div></div>
      <p className="impact-caption">{scene.caption}</p>
    </div>}
  </div>;
}
