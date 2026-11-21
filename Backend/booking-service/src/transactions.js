const { HttpError, fail } = require('./platform');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function supportsTransactions(connection) {
  const hello = await connection.db.command({ hello: 1 });
  return Boolean(hello.setName && hello.isWritablePrimary && hello.logicalSessionTimeoutMinutes);
}
async function transaction(connection, work) {
  const session = await connection.startSession();
  try {
    for (let attempt = 0; attempt < 7; attempt++) {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 5000 });
      try {
        const result = await work(session);
        // Never rerun the callback after an ambiguous commit: retry that commit only.
        for (let commit = 0; ; commit++) {
          try { await session.commitTransaction(); return result; }
          catch (error) {
            if (error.hasErrorLabel?.('UnknownTransactionCommitResult')) {
              if (commit >= 4) throw new HttpError(503, 'DEPENDENCY_UNAVAILABLE', 'Commit outcome is uncertain; retry the same request key');
              await pause(15 * (commit + 1)); continue;
            }
            throw error;
          }
        }
      } catch (error) {
        if (session.inTransaction()) await session.abortTransaction().catch(() => {});
        const retryable = error.hasErrorLabel?.('TransientTransactionError') || [112, 244, 251, 11000].includes(error.code);
        if (!retryable || error instanceof HttpError) throw error;
        if (attempt === 6) fail(503, 'DEPENDENCY_UNAVAILABLE', 'Contention; retry the same request key');
        await pause(10 * (attempt + 1) + Math.random() * 20);
      }
    }
  } finally { await session.endSession(); }
}
async function lock(models, session, petId, resourceIds) {
  // Global order for all schedule writers: pet guard, then sorted resource records.
  if (petId) await models.PetGuard.findOneAndUpdate({ _id: petId }, { $inc: { version: 1 } }, { upsert: true, session });
  for (const resourceId of [...new Set(resourceIds.map(String))].sort()) {
    const resource = await models.Resource.findOneAndUpdate({ _id: resourceId }, { $inc: { schedule_version: 1 } }, { session, returnDocument: 'after' }).lean();
    if (!resource) fail(404, 'NOT_FOUND', 'Resource not found');
  }
}
module.exports = { transaction, supportsTransactions, lock };
