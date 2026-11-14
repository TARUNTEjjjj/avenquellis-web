// An application update must never interrupt work whose timing or editor state
// belongs to this window, even if the latest answer was saved successfully.
export function canApplyAppUpdate({ready, storageOK, session, completingSession, page}) {
  return ready === true && storageOK === true && !completingSession &&
    (!session || session.submittedAt != null) &&
    ['overview', 'archive', 'tests', 'chapters', 'progress', 'sources'].includes(page);
}
