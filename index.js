const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

app.use(cors({
    origin: '*',
    methods: ['POST', 'GET']
}));

app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.get('/', (req, res) => res.send('Backend is Live!'));

app.post('/api/analyze', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            console.log("Error: No file");
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        if (!req.body.user_id) {
             return res.status(400).json({ error: 'Missing user_id' });
        }

        // 1. Upload to Supabase
        const fileName = `${Date.now()}_${req.file.originalname}`;
        const { error: uploadError } = await supabase.storage
            .from('scans')
            .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

        if (uploadError) {
            console.error("Storage Error:", uploadError);
            throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
            .from('scans')
            .getPublicUrl(fileName);

        // 2. Mock AI Response
        const isDefect = Math.random() > 0.5;
        const mockResult = {
            status: isDefect ? "Defect Detected" : "Clean",
            confidence: 0.95,
            defect_type: isDefect ? "Screen Crack" : "None",
            device_name: "Vercel Backend Device",
        };
        
        const { error: dbError } = await supabase
            .from('inspections')
            .insert({
                user_id: req.body.user_id,
                image_url: publicUrl,
                filename: fileName, 
                prediction: mockResult.status,
                defect_type: mockResult.defect_type,
                confidence: mockResult.confidence,
                device_name: mockResult.device_name
            });

        if (dbError) {
            console.error("DB Insert Error:", dbError); 
            throw dbError;
        }

        res.json({ ...mockResult, image_url: publicUrl });

    } catch (error) {
        console.error("CRASH:", error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = app;