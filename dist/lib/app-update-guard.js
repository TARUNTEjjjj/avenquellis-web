// An application update must never interrupt work whose timing or editor state
// belongs to this window, even if the latest answer was saved successfully.
// Nor may it discard typing that is still waiting to be saved (savePending).
export function canApplyAppUpdate({ready, storageOK, session, completingSession, page,
  savePending = false}) {
  return ready === true && storageOK === true && !completingSession && !savePending &&
    (!session || session.submittedAt != null) &&
    ['overview', 'archive', 'tests', 'chapters', 'progress', 'sources'].includes(page);
}
