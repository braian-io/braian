import { describe, expect, it } from 'vitest'
import { detectConfigFiles } from './config-drop'

function file(name: string, content: string) {
  return new File([content], name, { type: 'text/plain' })
}

describe('detectConfigFiles', () => {
  it('detects a YAML config document', async () => {
    const files = [file('model.yaml', 'apiVersion: braian.io/v1\nkind: Model\nattributes: []\n')]
    await expect(detectConfigFiles(files)).resolves.toBe(files)
  })

  it('detects a JSON array of config documents', async () => {
    const files = [
      file(
        'config.json',
        JSON.stringify([
          { apiVersion: 'braian.io/v1', kind: 'Model', attributes: [] },
          { apiVersion: 'braian.io/v1', kind: 'ValueList', key: 'colors', options: [] },
        ]),
      ),
    ]
    await expect(detectConfigFiles(files)).resolves.toBe(files)
  })

  it('rejects a non-config CSV file', async () => {
    await expect(detectConfigFiles([file('rows.csv', 'key,name\n1,One\n')])).resolves.toBeNull()
  })

  it('rejects a mixed set when one file is not config', async () => {
    const files = [
      file('model.yml', 'apiVersion: braian.io/v1\nkind: Model\n'),
      file('rows.csv', 'key,name\n1,One\n'),
    ]
    await expect(detectConfigFiles(files)).resolves.toBeNull()
  })
})
