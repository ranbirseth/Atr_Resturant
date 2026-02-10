const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const printQueue = require('./printQueue');
const { generateKOTPdf, printJob, setPrinters } = require('./printer');
// Import node-printer to list printers if possible
// const printer = require('pdf-to-printer'); 

const app = express();
const PORT = 6001;

app.use(cors());
app.use(bodyParser.json());

// Configuration Endpoint
app.post('/config', (req, res) => {
    const { kitchenPrinter, adminPrinter } = req.body;
    setPrinters(kitchenPrinter, adminPrinter);
    res.json({ message: 'Printers configured' });
});

app.get('/printers', async (req, res) => {
    try {
        const { getPrinters } = require('pdf-to-printer');
        const printers = await getPrinters();
        res.json(printers);
    } catch (error) {
        res.status(500).json({ message: 'Failed to list printers', error: error.message });
    }
});

// Print Endpoint
app.post('/print', (req, res) => {
    const { order, type } = req.body; // type: 'KITCHEN', 'ADMIN', 'BOTH' (default)

    if (!order) return res.status(400).json({ message: 'No order data provided' });

    const jobType = type || 'BOTH';
    const jobId = `JOB-${Date.now()}`;

    // Create print jobs
    const jobs = [];

    // Job logic function
    const createJob = (targetType, printerName) => {
        return {
            id: `${jobId}-${targetType}`,
            type: targetType,
            execute: async () => {
                // 1. Generate PDF
                const pdfPath = generateKOTPdf(order, targetType);
                // 2. Send to specific printer (replace with actual printer name logic)
                // For now, using default system printer or configured one
                // In a real scenario, we'd map "KITCHEN" to a specific printer name
                // const printerName = (targetType === 'KITCHEN') ? KITCHEN_PRINTER : ADMIN_PRINTER;
                // Passing undefined to 'print' uses default printer.
                await printJob(pdfPath, printerName);
            },
            onSuccess: () => console.log(`Job ${targetType} succeeded`),
            onError: (err) => {
                console.error(`Job ${targetType} failed`, err);
                // Don't crash the server/queue processing
            }
        };
    };

    // Add to queue
    // Note: We need a way to know WHICH printer to use. 
    // For this MVP, we will assume the User configures it or we use default.
    // Let's assume queue.add handles it.

    // For simplicity in this step, we will just add a generic job.

    printQueue.add(createJob('KITCHEN', undefined)); // Undefined = Default printer for now

    // If we wanted dual printing:
    // printQueue.add(createJob('ADMIN', undefined));

    res.json({ message: 'Print job queued', jobId });
});

app.listen(PORT, () => {
    console.log(`🖨️ Aatreyo Print Service running on http://localhost:${PORT}`);
    console.log(`   - Keep this window open for printing to work.`);
});
