# NEET Botany Resources - File Upload Feature

## Quick Start

### Starting the Server

```bash
npm start
```

Then open your browser to: **http://localhost:3000**

## How to Upload Files

1. Click the **"📤 Upload Resources"** button (green button in the header)
2. Fill in the form:
   - **Class**: Select 11 or 12
   - **Chapter Name**: Use underscores instead of spaces (e.g., `Anatomy_of_Flowering_Plants`)
   - **Tags** (optional): Add comma-separated tags (e.g., `anatomy, morphology`)
   - **Files**: Click or drag files (PDFs and images supported)
3. Click **"Upload"**
4. Your files will automatically:
   - Be saved to `resources/{class}/{chapter}/`
   - Appear on the homepage
   - Be added to `resources.json`

## Supported File Types

- ✅ PDF files (`.pdf`)
- ✅ Images (`.png`, `.jpg`, `.jpeg`, `.webp`)
- ❌ Maximum file size: 50MB per file

## Folder Structure

When you upload a file for Class 11 in chapter "Plant_Anatomy":
```
resources/
└── 11/
    └── Plant_Anatomy/
        └── your_file.pdf
```

## Example

**Upload**: A PDF called "Cell Structure.pdf" to Class 11, Chapter "Plant_Anatomy"

**Result**:
- File location: `resources/11/Plant_Anatomy/Cell Structure.pdf`
- Automatically added to resources.json
- Immediately visible on the dashboard

## Features

- ✅ Multiple file upload at once
- ✅ Automatic folder creation
- ✅ Automatic database updates
- ✅ Real-time dashboard refresh
- ✅ Progress indicator
- ✅ Error handling
- ✅ File validation

## Troubleshooting

**Server won't start?**
- Make sure port 3000 is not in use
- Run `npm install` first

**Upload fails?**
- Check file size (max 50MB)
- Ensure file type is PDF or image
- Verify class and chapter are filled in

**Files don't appear?**
- Refresh the page
- Check browser console for errors

## Security Notes

This is a **local development server** for personal use. If deploying publicly, additional security measures are required:
- User authentication
- HTTPS encryption
- Input sanitization
- Rate limiting
- File scanning

---

For detailed documentation, see [walkthrough.md](file:///C:/Users/Sohan/.gemini/antigravity/brain/f09d629d-4e9b-48e9-9e16-ed25eac48069/walkthrough.md)
