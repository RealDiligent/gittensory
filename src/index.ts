import { createApp } from "./api/routes";
import { processJob } from "./queue/processors";
import type { JobMessage } from "./types";

const app = createApp();

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<JobMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processJob(env, message.body);
        message.ack();
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            event: "queue_message_failed",
            messageId: message.id,
            error: error instanceof Error ? error.message : "unknown error",
          }),
        );
        message.retry();
      }
    }
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(processJob(env, { type: "refresh-registry", requestedBy: "schedule" }));
  },
};
