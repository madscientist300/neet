// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const bcrypt = require('bcrypt');

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
      pinHash: null,
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
(async () => {
  config = await loadConfig();
  if (!config.setupComplete) {
    console.log('⚠️  PIN not configured. Please set up PIN at http://localhost:3000');
  } else {
    console.log('🔒 PIN protection enabled');
  }
})();

// Serve static files
app.use(express.static(__dirname));
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const classNum = req.body.class;
    const chapter = req.body.chapter.replace(/\s+/g, '_'); // Replace spaces with underscores
    const uploadPath = path.join(__dirname, 'resources', classNum, chapter);

    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
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
  // Accept only PDFs and images
  const allowedTypes = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF and image files are allowed.'), false);
  }
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

// Get file type from mimetype
function getFileType(mimetype) {
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype.startsWith('image/')) return 'image';
  return 'file';
}

// PIN validation middleware
async function validatePIN(req, res, next) {
  const { pin } = req.body;

  // Reload config to get latest PIN
  const currentConfig = await loadConfig();

  if (!currentConfig.setupComplete || !currentConfig.pinHash) {
    return res.status(401).json({
      success: false,
      message: 'PIN not configured. Please set up PIN first.'
    });
  }

  if (!pin) {
    return res.status(401).json({
      success: false,
      message: 'PIN is required'
    });
  }

  const isValid = await bcrypt.compare(pin, currentConfig.pinHash);

  if (!isValid) {
    return res.status(401).json({
      success: false,
      message: '❌ Incorrect PIN. Please try again.'
    });
  }

  next();
}

// Upload endpoint with PIN protection
app.post('/api/upload', upload.array('files'), validatePIN, async (req, res) => {
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
        chapter: chapter.replace(/\s+/g, '_'),
        topic: fileName,
        type: getFileType(file.mimetype),
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

// Delete endpoint with PIN protection
app.post('/api/delete', validatePIN, async (req, res) => {
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

// Check if PIN is configured
app.get('/api/pin-status', async (req, res) => {
  const currentConfig = await loadConfig();
  res.json({
    setupComplete: currentConfig.setupComplete || false
  });
});

// Set up PIN (only works if not already set)
app.post('/api/setup-pin', async (req, res) => {
  try {
    const { pin } = req.body;

    if (!pin || pin.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'PIN must be at least 4 characters'
      });
    }

    const currentConfig = await loadConfig();

    if (currentConfig.setupComplete) {
      return res.status(400).json({
        success: false,
        message: 'PIN already configured. Use change-pin endpoint to update.'
      });
    }

    const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);
    currentConfig.pinHash = pinHash;
    currentConfig.setupComplete = true;

    await saveConfig(currentConfig);
    config = currentConfig; // Update in-memory config

    res.json({
      success: true,
      message: '✅ PIN configured successfully!'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to set PIN: ' + error.message
    });
  }
});

// Change PIN (requires old PIN)
app.post('/api/change-pin', async (req, res) => {
  try {
    const { oldPin, newPin } = req.body;

    if (!oldPin || !newPin) {
      return res.status(400).json({
        success: false,
        message: 'Both old and new PIN are required'
      });
    }

    if (newPin.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'New PIN must be at least 4 characters'
      });
    }

    const currentConfig = await loadConfig();

    if (!currentConfig.setupComplete || !currentConfig.pinHash) {
      return res.status(400).json({
        success: false,
        message: 'No PIN configured. Please set up PIN first.'
      });
    }

    const isValid = await bcrypt.compare(oldPin, currentConfig.pinHash);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: '❌ Incorrect old PIN'
      });
    }

    const newPinHash = await bcrypt.hash(newPin, SALT_ROUNDS);
    currentConfig.pinHash = newPinHash;

    await saveConfig(currentConfig);
    config = currentConfig; // Update in-memory config

    res.json({
      success: true,
      message: '✅ PIN changed successfully!'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to change PIN: ' + error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Upload feature is ready!');
});
