import { validateAiProposal } from './ai-proposals.ts';

export type AiProposalDecision =
  | { action: 'reject'; reason: string }
  | { action: 'accept'; selections: Array<{ operationIndex: number; replacement?: Record<string, unknown> }> };

export function validateAiProposalDecision(value: unknown, proposal: Record<string, any>):
  { valid: true; decision: AiProposalDecision } | { valid: false; errors: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['A decision object is required.'] };
  const input = value as Record<string, any>;
  if (input.action === 'reject') {
    if (Object.keys(input).some(key => !['action', 'reason'].includes(key))) return { valid: false, errors: ['The rejection contains unknown fields.'] };
    const reason = String(input.reason ?? '').trim();
    if (reason.length < 1 || reason.length > 1000) return { valid: false, errors: ['A rejection reason of 1–1000 characters is required.'] };
    return { valid: true, decision: { action: 'reject', reason } };
  }
  if (input.action !== 'accept' || Object.keys(input).some(key => !['action', 'selections'].includes(key))) return { valid: false, errors: ['Decision action is invalid.'] };
  if (!Array.isArray(input.selections) || input.selections.length < 1 || input.selections.length > proposal.operations.length) return { valid: false, errors: ['Select between one and every proposed operation.'] };
  const indexes = new Set<number>(); const selections: Array<{ operationIndex: number; replacement?: Record<string, unknown> }> = [];
  for (const selection of input.selections) {
    if (!selection || typeof selection !== 'object' || Array.isArray(selection) || Object.keys(selection).some(key => !['operationIndex', 'replacement'].includes(key))) return { valid: false, errors: ['A selection contains unknown fields.'] };
    const index = selection.operationIndex;
    if (!Number.isInteger(index) || index < 0 || index >= proposal.operations.length || indexes.has(index)) return { valid: false, errors: ['Operation selections must be unique valid indexes.'] };
    indexes.add(index);
    if (selection.replacement !== undefined) {
      const candidate = { ...proposal, operations: [selection.replacement] };
      const validation = validateAiProposal(candidate);
      if (!validation.valid) return { valid: false, errors: validation.errors.map(error => `Replacement ${index}: ${error}`) };
      selections.push({ operationIndex: index, replacement: selection.replacement });
    } else selections.push({ operationIndex: index });
  }
  return { valid: true, decision: { action: 'accept', selections } };
}
