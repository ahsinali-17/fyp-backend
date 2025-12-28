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

app.get('/', (req, res) => res.send('QA Backend is Live!'));

app.post('/api/analyze', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        // 1. Upload to Supabase
        const fileName = `${Date.now()}_${req.file.originalname}`;
        const { error: uploadError } = await supabase.storage
            .from('inspections')
            .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('inspections')
            .getPublicUrl(fileName);

        // 2. Mock AI Response
        const isDefect = Math.random() > 0.5;
        const mockResult = {
            prediction: isDefect ? "Defect Detected" : "Clean",
            confidence: 0.95,
            defect_type: isDefect ? "Screen Crack" : "None",
            device_name: "Vercel Backend Device",
            image_url: publicUrl
        };

        // 3. Save to Database
        const { error: dbError } = await supabase
            .from('inspections')
            .insert({
                user_id: req.body.user_id,
                ...mockResult,
            });
            
        if (dbError) throw dbError;

        res.json(mockResult);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = app;