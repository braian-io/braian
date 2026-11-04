import type { CommandTarget } from './command-registry'
import { registerCommandRunner } from './command-registry'
import { openModelDialog, stageModel } from './model-stage'
import { reportWriteError } from './write-error'

/**
 * Model create/delete runners for the shared registry.
 * Mount once from the shell so Ctrl+K and context menus work in every view.
 * Deletes go through stageModel (proposal/draft), never a direct agent delete.
 */
export function registerModelCommandRunners(): () => void {
  const stops = [
    registerCommandRunner('model:new-type', () => openModelDialog('type')),
    registerCommandRunner('model:new-link-type', () => openModelDialog('link')),
    registerCommandRunner('model:new-list', () => openModelDialog('list')),
    registerCommandRunner('model:new-family', () => openModelDialog('family')),
    registerCommandRunner('model:delete-type', (target) => {
      if (target.typeKey) void stageModel('model.delete_type', { type: String(target.typeKey) }).catch((reason: unknown) => { reportWriteError(reason) })
    }),
    registerCommandRunner('model:delete-link-type', (target) => {
      if (target.typeKey) void stageModel('model.delete_link_type', { key: String(target.typeKey) }).catch((reason: unknown) => { reportWriteError(reason) })
    }),
    registerCommandRunner('model:delete-list', (target) => {
      if (target.listKey) void stageModel('model.delete_value_list', { value_list: String(target.listKey) }).catch((reason: unknown) => { reportWriteError(reason) })
    }),
    registerCommandRunner('model:delete-option', (target) => {
      if (target.listKey && target.optionCode) {
        void stageModel('model.delete_value_option', {
          value_list: String(target.listKey),
          option: String(target.optionCode),
        }).catch((reason: unknown) => { reportWriteError(reason) })
      }
    }),
    registerCommandRunner('model:delete-family', (target) => {
      if (target.familyKey) void stageModel('model.delete_unit_family', { unit_family: String(target.familyKey) }).catch((reason: unknown) => { reportWriteError(reason) })
    }),
    registerCommandRunner('model:delete-unit', (target) => {
      if (target.familyKey && target.unitCode) {
        void stageModel('model.delete_unit', {
          unit_family: String(target.familyKey),
          unit: String(target.unitCode),
        }).catch((reason: unknown) => { reportWriteError(reason) })
      }
    }),
  ]
  return () => stops.forEach((stop) => stop())
}

/** Exported for tests that assert delete runners only stage proposals. */
export function deleteTypeRunner(target: CommandTarget) {
  if (target.typeKey) return stageModel('model.delete_type', { type: String(target.typeKey) })
}
