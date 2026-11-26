import { Button } from './components/ui/button'
import { copy } from './i18n'
import { filterIntegerInput, type LinkField } from './link-choices'

export function LinkAttributeFields({
  fields,
  draft,
  fieldErrors,
  onFieldChange,
  autoFocusFirst = false,
}: {
  fields: LinkField[]
  draft: Record<string, string>
  fieldErrors: Record<string, string>
  onFieldChange: (key: string, value: string, invalid?: boolean) => void
  autoFocusFirst?: boolean
}) {
  return fields.map((field, index) => (
    <div className="create-field" key={field.key}>
      <label htmlFor={`link-field-${field.key}`}>{field.label}</label>
      {field.kind === 'boolean' ? (
        <select
          id={`link-field-${field.key}`}
          data-testid={`link-field-${field.key}`}
          autoFocus={autoFocusFirst && index === 0}
          value={draft[field.key] ?? ''}
          onChange={(event) => onFieldChange(field.key, event.target.value)}
        >
          <option value="">{copy.noValue}</option>
          <option value="true">{copy.yes}</option>
          <option value="false">{copy.no}</option>
        </select>
      ) : field.options.length > 0 ? (
        <select
          id={`link-field-${field.key}`}
          data-testid={`link-field-${field.key}`}
          autoFocus={autoFocusFirst && index === 0}
          value={draft[field.key] ?? ''}
          onChange={(event) => onFieldChange(field.key, event.target.value)}
        >
          <option value="">{copy.noValue}</option>
          {field.options.map((option) => (
            <option key={option.code} value={option.code}>{option.label}</option>
          ))}
        </select>
      ) : (
        <input
          id={`link-field-${field.key}`}
          data-testid={`link-field-${field.key}`}
          autoFocus={autoFocusFirst && index === 0}
          type={field.integer ? 'text' : field.kind === 'date' ? 'date' : 'text'}
          inputMode={field.kind === 'number' || field.kind === 'range' ? (field.integer ? 'numeric' : 'decimal') : undefined}
          data-kind={field.kind === 'number' || field.kind === 'range' ? 'number' : undefined}
          value={draft[field.key] ?? ''}
          placeholder={field.kind === 'date' ? 'YYYY-MM-DD' : field.kind === 'number' || field.kind === 'range' ? '0' : undefined}
          aria-invalid={fieldErrors[field.key] ? true : undefined}
          onChange={(event) => {
            const raw = event.target.value
            if (field.integer) {
              if (raw !== '' && raw !== '-' && !/^-?\d*$/.test(raw)) {
                onFieldChange(field.key, draft[field.key] ?? '', true)
                return
              }
              onFieldChange(field.key, filterIntegerInput(raw))
              return
            }
            const invalid = (field.kind === 'number' || field.kind === 'range')
              && raw.trim() !== ''
              && !Number.isFinite(Number(raw.trim()))
            onFieldChange(field.key, raw, invalid)
          }}
        />
      )}
      {fieldErrors[field.key] ? (
        <p className="error" role="alert" data-testid={`link-field-error-${field.key}`}>{fieldErrors[field.key]}</p>
      ) : null}
    </div>
  ))
}