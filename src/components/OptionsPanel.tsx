import type { OptionField, Options } from '../tools/types';

export default function OptionsPanel({ fields, options, setOptions }: { fields: OptionField[]; options: Options; setOptions: (o: Options) => void }) {
  const set = (key: string, value: unknown) => setOptions({ ...options, [key]: value });
  return (
    <div className="options">
      {fields
        .filter((f) => !f.showIf || f.showIf(options))
        .map((f) => {
          const v = options[f.key];
          switch (f.type) {
            case 'choice':
              return (
                <fieldset key={f.key} className="opt">
                  <legend>{f.label}</legend>
                  <div className="choices">
                    {f.choices.map((c) => (
                      <button key={c.value} type="button" className={`choice ${v === c.value ? 'active' : ''}`} onClick={() => set(f.key, c.value)}>
                        <span className="choice-label">{c.label}</span>
                        {c.hint && <span className="choice-hint">{c.hint}</span>}
                      </button>
                    ))}
                  </div>
                </fieldset>
              );
            case 'select':
              return (
                <label key={f.key} className="opt">
                  <span className="opt-label">{f.label}</span>
                  <select value={v ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                    {f.choices.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </label>
              );
            case 'checkbox':
              return (
                <label key={f.key} className="opt opt-check">
                  <input type="checkbox" checked={!!v} onChange={(e) => set(f.key, e.target.checked)} />
                  <span>{f.label}</span>
                </label>
              );
            case 'color':
              return (
                <label key={f.key} className="opt opt-inline">
                  <span className="opt-label">{f.label}</span>
                  <input type="color" value={v ?? '#000000'} onChange={(e) => set(f.key, e.target.value)} />
                </label>
              );
            case 'range':
              return (
                <label key={f.key} className="opt">
                  <span className="opt-label">
                    {f.label} <b>{v}{f.unit}</b>
                  </span>
                  <input type="range" min={f.min} max={f.max} step={f.step ?? 1} value={v ?? f.min} onChange={(e) => set(f.key, Number(e.target.value))} />
                </label>
              );
            case 'number':
              return (
                <label key={f.key} className="opt">
                  <span className="opt-label">{f.label}</span>
                  <input type="number" min={f.min} max={f.max} step={f.step} value={v ?? ''} onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value))} />
                </label>
              );
            case 'image':
              return (
                <label key={f.key} className="opt">
                  <span className="opt-label">{f.label}</span>
                  <input type="file" accept="image/*" onChange={(e) => set(f.key, e.target.files?.[0])} />
                  {v instanceof File && <span className="opt-hint">{v.name}</span>}
                </label>
              );
            case 'textarea':
              return (
                <label key={f.key} className="opt">
                  <span className="opt-label">{f.label}</span>
                  <textarea rows={6} placeholder={f.placeholder} value={v ?? ''} onChange={(e) => set(f.key, e.target.value)} />
                </label>
              );
            default:
              return (
                <label key={f.key} className="opt">
                  <span className="opt-label">{f.label}</span>
                  <input type={f.type} placeholder={f.placeholder} value={v ?? ''} onChange={(e) => set(f.key, e.target.value)} autoComplete={f.type === 'password' ? 'new-password' : 'off'} />
                  {f.hint && <span className="opt-hint">{f.hint}</span>}
                </label>
              );
          }
        })}
    </div>
  );
}
