class PrintQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }

    add(job) {
        // job: { id, content, type: 'KITCHEN' | 'ADMIN', callback }
        console.log(`📥 Added to queue: Job ${job.id} (${job.type})`);
        this.queue.push(job);
        this.process();
    }

    async process() {
        if (this.isProcessing) return;
        if (this.queue.length === 0) return;

        this.isProcessing = true;
        const currentJob = this.queue.shift();

        try {
            console.log(`🖨️ Processing Job ${currentJob.id}...`);
            await currentJob.execute();
            console.log(`✅ Job ${currentJob.id} completed.`);
            if (currentJob.onSuccess) currentJob.onSuccess();
        } catch (error) {
            console.error(`❌ Job ${currentJob.id} failed:`, error);
            // Retry logic could go here, or just log and move on to prevent blocking
            if (currentJob.onError) currentJob.onError(error);
        } finally {
            this.isProcessing = false;
            // Add a small delay to prevent printer buffer overflow
            setTimeout(() => this.process(), 2000);
        }
    }
}

module.exports = new PrintQueue();
