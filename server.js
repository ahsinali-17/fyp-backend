require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const PYTHON_SERVICE_URL = 'http://127.0.0.1:5001/predict';

const upload = multer({ dest: 'uploads/' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Test route
app.get('/api/health', (req, res) => {
    res.json({ status: "Manager is online", port: PORT });
});

app.post('/api/analyze', upload.single('file'), async (req, res) => {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        const { user_id, device_name } = req.body;
        const filePath = req.file.path;
        const fileExt = path.extname(req.file.originalname);
        const fileName = `${user_id}/${Date.now()}_${Math.round(Math.random() * 1000)}${fileExt}`;

        try {
            console.log(`Processing scan for User: ${user_id}`);

            // Upload Image to Supabase Storage
            const fileBuffer = fs.readFileSync(filePath);
            
            const { data: storageData, error: storageError } = await supabase
                .storage
                .from('scans')
                .upload(fileName, fileBuffer, {
                    contentType: req.file.mimetype,
                    upsert: false
                });

            if (storageError) throw new Error(`Storage Upload Failed: ${storageError.message}`);

            // Get the Public URL
            const { data: { publicUrl } } = supabase
                .storage
                .from('scans')
                .getPublicUrl(fileName);

            console.log("✅ Image uploaded to Cloud:", publicUrl);


            // Call Python AI Service
            const formData = new FormData();
            formData.append('file', fs.createReadStream(filePath));

            const aiResponse = await axios.post(PYTHON_SERVICE_URL, formData, {
                headers: { ...formData.getHeaders() }
            });

            const { prediction, defect_type, confidence } = aiResponse.data;

            // Log Result in Supabase Database
            if (user_id) {
                const { error: dbError } = await supabase
                    .from('inspections')
                    .insert({
                        filename: req.file.originalname,
                        image_url: publicUrl, 
                        prediction: prediction,
                        defect_type: defect_type,
                        confidence: confidence,
                        user_id: user_id,
                        device_name: device_name || "Unknown Device"
                    });

                if (dbError) console.error("Database Error:", dbError.message);
            }

            // Response
            res.json({
                status: prediction,
                type: defect_type,
                confidence: `${confidence}%`,
                image_url: publicUrl,
                color: prediction.includes("Defect") ? "red" : "green"
            });

        } catch (error) {
            console.error("Error:", error.message);
            res.status(500).json({ error: "Processing Failed" });
        } finally {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    });

app.listen(PORT, () => {
    console.log(`🚀 Node API running on http://localhost:${PORT}`);
});