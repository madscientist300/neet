// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

// PIN Configuration
const CONFIG_FILE = path.join(__dirname, 'config.json');
const SALT_ROUNDS = 10;

// Load or create config
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // Create default config if not exists
    const defaultConfig = {
      adminEmail: null,
      adminPasswordHash: null,
      setupComplete: false
    };
    await saveConfig(defaultConfig);
    return defaultConfig;
  }
}

async function saveConfig(config) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// Initialize config on startup
let config = null;
const sessions = new Map(); // token -> email

(async () => {
  config = await loadConfig();
  if (!config.setupComplete) {
    console.log('⚠️  Admin not configured. Please set up at http://localhost:3000/admin.html');
  } else {
    console.log('🔒 Admin authentication enabled');
  }
})();

// Serve static files
app.use(express.static(__dirname));
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // Debug logging
    console.log('Multer Destination Called');
    console.log('Request Body:', req.body);
    console.log('File:', file.originalname);

    const classNum = req.body.class;
    const chapter = req.body.chapter;

    if (!classNum || !chapter) {
      console.error('Missing class or chapter in body during upload');
      return cb(new Error('Missing class or chapter information. ensure fields are sent before files.'));
    }

    // Allow spaces in folder names
    const uploadPath = path.join(__dirname, 'resources', classNum, chapter);
    console.log('Upload Path:', uploadPath);

    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      console.error('Mkdir failed:', error);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Sanitize filename: keep original name but ensure it's safe
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.\-_\s]/g, '');
    cb(null, sanitized);
  }
});

const fileFilter = (req, file, cb) => {
  // Accept PDFs, images, and PowerPoint files
  const allowedTypes = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'application/vnd.ms-powerpoint',                                                      // .ppt
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',          // .pptx
    'application/mspowerpoint',                                                            // alternative .ppt
    'application/powerpoint',                                                              // alternative .ppt
    'application/x-mspowerpoint'                                                           // alternative .ppt
  ];

  // Check MIME type
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
    return;
  }

  // Fallback: Check file extension for PowerPoint files (some browsers send wrong MIME types)
  const ext = file.originalname.toLowerCase().split('.').pop();
  if (ext === 'ppt' || ext === 'pptx') {
    console.log(`⚠️ PowerPoint file detected by extension (.${ext}) with MIME type: ${file.mimetype}`);
    cb(null, true);
    return;
  }

  cb(new Error(`Invalid file type. Only PDF, image, and PowerPoint files are allowed. Received: ${file.mimetype}`), false);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Generate unique ID
function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

// Get file type from mimetype and filename
function getFileType(mimetype, filename = '') {
  if (mimetype === 'application/pdf') return 'pdf';

  // Check PowerPoint MIME types
  if (mimetype === 'application/vnd.ms-powerpoint' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mimetype === 'application/mspowerpoint' ||
    mimetype === 'application/powerpoint' ||
    mimetype === 'application/x-mspowerpoint') {
    return 'ppt';
  }

  // Fallback: Check file extension
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'ppt' || ext === 'pptx') return 'ppt';

  if (mimetype.startsWith('image/')) return 'image';
  return 'file';
}

// Auth validation middleware
async function validateAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: No token provided'
    });
  }

  const token = authHeader.split(' ')[1];

  if (!sessions.has(token)) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or expired token'
    });
  }

  next();
}

// Upload endpoint with Auth protection
app.post('/api/upload', upload.array('files'), validateAuth, async (req, res) => {
  try {
    const { class: classNum, chapter, tags } = req.body;
    const files = req.files;

    if (!classNum || !chapter || !files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: class, chapter, or files'
      });
    }

    // Parse tags
    const tagArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];

    // Read current resources.json
    const resourcesPath = path.join(__dirname, 'resources.json');
    let resources = [];

    try {
      const data = await fs.readFile(resourcesPath, 'utf8');
      resources = JSON.parse(data);
    } catch (error) {
      console.log('Starting with empty resources array');
    }

    // Create entries for uploaded files
    const newResources = files.map(file => {
      const relativePath = path.relative(__dirname, file.path).replace(/\\/g, '/');
      const fileName = path.parse(file.originalname).name;

      return {
        id: generateId(),
        class: classNum,
        chapter: chapter,
        topic: fileName,
        type: getFileType(file.mimetype, file.originalname),
        title: fileName,
        file: relativePath,
        tags: tagArray
      };
    });

    // Add to resources array
    resources.push(...newResources);

    // Backup existing resources.json
    try {
      await fs.copyFile(resourcesPath, resourcesPath + '.backup');
    } catch (error) {
      console.log('No existing resources.json to backup');
    }

    // Write updated resources.json
    await fs.writeFile(resourcesPath, JSON.stringify(resources, null, 2), 'utf8');

    // Trigger thumbnail generation
    console.log('Triggering thumbnail generation...');
    exec('python thumbnail_generator.py --write', (error, stdout, stderr) => {
      if (error) {
        console.error(`Thumbnail generation error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Thumbnail generation stderr: ${stderr}`);
        return;
      }
      console.log(`Thumbnail generation output: ${stdout}`);
    });

    res.json({
      success: true,
      message: `Successfully uploaded ${files.length} file(s)`,
      files: newResources
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Upload failed: ' + error.message
    });
  }
});

// Delete endpoint with Auth protection
app.post('/api/delete', validateAuth, async (req, res) => {
  try {
    const { resourceId, file } = req.body;

    if (!resourceId || !file) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: resourceId or file'
      });
    }

    // Read current resources.json
    const resourcesPath = path.join(__dirname, 'resources.json');
    let resources = [];

    try {
      const data = await fs.readFile(resourcesPath, 'utf8');
      resources = JSON.parse(data);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Resources file not found'
      });
    }

    // Find the resource to delete
    const resourceIndex = resources.findIndex(r => r.id === resourceId);

    if (resourceIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }

    const resourceToDelete = resources[resourceIndex];

    // Delete the file from filesystem
    const filePath = path.join(__dirname, file);
    try {
      await fs.unlink(filePath);
      console.log(`Deleted file: ${filePath}`);
    } catch (error) {
      console.warn(`Could not delete file ${filePath}:`, error.message);
      // Continue anyway - the file might already be deleted
    }

    // Remove from resources array
    resources.splice(resourceIndex, 1);

    // Backup existing resources.json
    try {
      await fs.copyFile(resourcesPath, resourcesPath + '.backup');
    } catch (error) {
      console.log('Could not create backup:', error.message);
    }

    // Write updated resources.json
    await fs.writeFile(resourcesPath, JSON.stringify(resources, null, 2), 'utf8');

    res.json({
      success: true,
      message: 'Resource deleted successfully',
      deletedResource: resourceToDelete
    });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Delete failed: ' + error.message
    });
  }
});

// Get chapters for a specific class
app.get('/api/chapters/:class', async (req, res) => {
  try {
    const classNum = req.params.class;
    const resourcesPath = path.join(__dirname, 'resources.json');

    const data = await fs.readFile(resourcesPath, 'utf8');
    const resources = JSON.parse(data);

    const chapters = [...new Set(
      resources
        .filter(r => r.class === classNum)
        .map(r => r.chapter)
    )].sort();

    res.json({ success: true, chapters });
  } catch (error) {
    res.json({ success: true, chapters: [] });
  }
});

// Check admin status
app.get('/api/admin-status', async (req, res) => {
  const currentConfig = await loadConfig();
  // Only consider setup complete if adminEmail exists
  const isSetup = currentConfig.setupComplete && currentConfig.adminEmail;
  res.json({
    setupComplete: !!isSetup
  });
});

// Admin Setup
app.post('/api/setup-admin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Email and Password (min 6 chars) required'
      });
    }

    const currentConfig = await loadConfig();

    // Allow setup if adminEmail is missing (even if setupComplete was true from old PIN system)
    if (currentConfig.setupComplete && currentConfig.adminEmail) {
      return res.status(400).json({
        success: false,
        message: 'Admin already configured.'
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    currentConfig.adminEmail = email;
    currentConfig.adminPasswordHash = passwordHash;
    currentConfig.setupComplete = true;

    await saveConfig(currentConfig);
    config = currentConfig;

    res.json({
      success: true,
      message: '✅ Admin configured successfully! Please login.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Setup failed: ' + error.message
    });
  }
});

// Admin Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const currentConfig = await loadConfig();

    if (!currentConfig.setupComplete) {
      return res.status(400).json({
        success: false,
        message: 'Admin not configured.'
      });
    }

    if (email !== currentConfig.adminEmail) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, currentConfig.adminPasswordHash);

    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, email);

    res.json({
      success: true,
      token: token,
      message: 'Login successful'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Login failed: ' + error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Upload feature is ready!');
});
