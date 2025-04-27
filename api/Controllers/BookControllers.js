const Book = require('../Models/BookModels');
const Tag = require('../Models/TagModels'); // Added Tag model
const User = require('../Models/UserModels'); // Added User model
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const { conn, getGfs } = require('../config/gfs');
const upload = require('../config/multer'); // Multer config for uploads
const jwt = require('jsonwebtoken'); // For optional auth check


// Create a new book with file upload
const createBook = async (req, res) => {
    try {
        console.log("File received:", req.file); 

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded (ensure field name is "bookfile")' });
        }
        if (req.file.mimetype !== 'application/pdf') {
            return res.status(400).json({ error: 'Invalid file type. Only PDF is allowed.' });
        }

        const { title, description, author, tags, featuredImage, visibility, publicationDate } = req.body;

        // Basic validation
        if (!title || !description || !author) {
            return res.status(400).json({ error: 'Title, description, and author are required.' });
        }

        let parsedTags = [];
        if (tags) {
            try {
                parsedTags = JSON.parse(tags);
                if (!Array.isArray(parsedTags)) throw new Error("Tags must be an array.");
            } catch (e) {
                return res.status(400).json({ error: 'Invalid tags format. Must be a JSON array string.' });
            }
        }

        const newBook = new Book({
            title,
            author, 
            description,
            uploader: req.user._id, 
            tags: parsedTags,
            featuredImage, 
            visibility: visibility || 'public', 
            publicationDate: publicationDate || null,
            file: {
                filename: req.file.filename,
                id: req.file.id // GridFS file ID
            },
        });

        await newBook.save();
        const populatedBook = await Book.findById(newBook._id)
            .populate('uploader', 'name')
            .populate('tags', 'name');

        res.status(201).json(populatedBook);
    } catch (error) {
        console.error("Error creating book:", error);
        if (req.file && req.file.id) {
            try {
                const bucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'BookUploads' });
                bucket.delete(new mongoose.Types.ObjectId(req.file.id));
                console.log(`Orphaned file ${req.file.id} deleted after book save error.`);
            } catch (deleteError) {
                console.error(`Failed to delete orphaned file ${req.file.id}:`, deleteError);
            }
        }

        if (error.name === 'ValidationError') {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Server error during book creation' });
        }
    }
};


// Get all books (with Pagination and Search)
const getAllBooks = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const searchQuery = req.query.search || '';

        let userId = null;
         if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
             try {
                const token = req.headers.authorization.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.id).select('_id');
                if (user) userId = user._id;
            } catch (e) { /* ignore */ }
        }

        // --- Build Query ---
        let query = {
            visibility: 'public' 
        };

        if (searchQuery) {
            query.$text = { $search: searchQuery };
            // Regex alternative:
            // query.$or = [
            //     { title: { $regex: searchQuery, $options: 'i' } },
            //     { description: { $regex: searchQuery, $options: 'i' } },
            //     { author: { $regex: searchQuery, $options: 'i' } }
            // ];
        }

        // --- Execute Queries ---
        const booksQuery = Book.find(query)
            .populate('uploader', 'name') 
            .populate('tags', 'name')
            .select('-file')
            .sort({ uploadDate: -1 }) 
            .skip(skip)
            .limit(limit);

        const totalBooksQuery = Book.countDocuments(query);

        const [books, totalBooks] = await Promise.all([booksQuery, totalBooksQuery]);

         // Add isLiked status
         const booksWithLikes = books.map(book => {
            const isLiked = userId ? book.likes.includes(userId) : false;
            // Convert to plain object to add property, or use lean() in query
            const bookObj = book.toObject ? book.toObject() : { ...book };
            bookObj.isLiked = isLiked;
            bookObj.likesCount = book.likes.length; 
            return bookObj;
         });


        const totalPages = Math.ceil(totalBooks / limit);

        // --- Format Response ---
        res.status(200).json({
            books: booksWithLikes,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems: totalBooks,
                limit
            }
        });

    } catch (error) {
        console.error('Error fetching all books:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Get all books only id and image (No changes needed for pagination/search here)
const getAllBookIdsAndImages = async (req, res) => {
  try {
      const books = await Book.find({ visibility: 'public' }, '_id featuredImage title') // Added title
          .sort({ uploadDate: -1 }) 
          .limit(20);
      res.status(200).json(books);
  } catch (error) {
      console.error('Error fetching book IDs and featured images:', error);
      res.status(500).json({ error: 'Server error' });
  }
};

// Get a single book's details (metadata, not the file)
const getBookDetailsById = async (req, res) => {
    const bookId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(bookId)) {
        return res.status(400).json({ error: 'Invalid Book ID format' });
    }

    let userId = null;
    // Optional authentication for like status
     if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
         try {
            const token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('_id');
            if (user) userId = user._id;
        } catch (e) { /* ignore */ }
    }


    try {
        const book = await Book.findById(bookId)
            .populate('uploader', 'name profilePic') 
            .populate('tags', 'name')
            .populate({ 
                path: 'comments',
                options: { limit: 10, sort: { createdAt: -1 } }, 
                populate: { path: 'author', select: 'name profilePic' }
            })
            .select('-file');
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        // Check visibility
        if (book.visibility !== 'public' && (!userId || !book.uploader._id.equals(userId))) {
             // Add admin check here if needed
            return res.status(403).json({ error: 'Forbidden: Cannot access this book' });
        }

         // Add like status and count
         const isLiked = userId ? book.likes.includes(userId) : false;
         const bookObj = book.toObject ? book.toObject() : { ...book };
         bookObj.isLiked = isLiked;
         bookObj.likesCount = book.likes.length;
         // delete bookObj.likes; // Optionally remove full array

        res.status(200).json(bookObj);
    } catch (error) {
        console.error('Error fetching book details:', error);
        res.status(500).json({ error: 'Server error' });
    }
};


const getBookById = async (req, res) => {
    const bookId = req.params.id; 
     if (!mongoose.Types.ObjectId.isValid(bookId)) {
        return res.status(400).json({ error: 'Invalid Book ID format' });
    }

    const gfs = getGfs(); 
    if (!gfs) {
        console.error('GridFS not initialized when trying to get book file.');
        return res.status(500).json({ error: 'GridFS service is unavailable' });
    }


    try {
        const book = await Book.findById(bookId).select('file visibility uploader'); // Select necessary fields
        if (!book || !book.file || !book.file.id) {
            return res.status(404).json({ error: 'Book record or associated file reference not found' });
        }

        const fileId = book.file.id; // This is the GridFS file ID

        if (!mongoose.Types.ObjectId.isValid(fileId)) {
             console.error(`Invalid GridFS file ID format stored in book ${bookId}: ${fileId}`);
            return res.status(500).json({ error: 'Internal server error: Invalid file reference' });
        }
        const fileObjectId = new mongoose.Types.ObjectId(fileId); // Convert just in case it's a string

        const file = await gfs.files.findOne({ _id: fileObjectId });

        if (!file) {
             console.error(`GridFS file not found for ID: ${fileObjectId} (referenced by book ${bookId})`);
            return res.status(404).json({ error: 'File data not found in storage' });
        }

        if (file.contentType !== 'application/pdf') {
            return res.status(400).json({ error: 'File is not a PDF' }); // Or 404 if hiding non-PDFs
        }

        // --- Stream the file ---
        const bucket = new mongoose.mongo.GridFSBucket(conn.db, {
            bucketName: 'BookUploads' // Ensure this matches multer config
        });

        const readstream = bucket.openDownloadStream(file._id);

        // Set headers for download
        res.set('Content-Type', file.contentType);
        // Optional: Set filename for download prompt
        res.set('Content-Disposition', `inline; filename="${file.filename}"`); // inline or attachment

        // Pipe the stream to the response
        readstream.pipe(res);

        // Handle stream errors
        readstream.on('error', (err) => {
            console.error(`Error streaming file ${file._id}:`, err);
            // Avoid sending further response data if headers already sent
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error streaming file' });
            }
        });

    } catch (error) {
        console.error(`Error retrieving book file for ID ${bookId}:`, error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Server error retrieving file' });
        }
    }
};


// Update a book's metadata (not the file)
const updateBook = async (req, res) => {
    try {
        const bookId = req.params.id;
         if (!mongoose.Types.ObjectId.isValid(bookId)) {
            return res.status(400).json({ error: 'Invalid Book ID format' });
        }

        const book = await Book.findById(bookId);
        if (!book) {
            return res.status(404).json({ message: 'Book not found' });
        }

        if (!book.uploader.equals(req.user._id)) {
            return res.status(403).json({ message: 'User not authorized to update this book' });
        }

        // Whitelist updatable fields
        const { title, description, author, tags, featuredImage, visibility, publicationDate } = req.body;
        const updates = {};
        if (title) updates.title = title;
        if (description) updates.description = description;
        if (author) updates.author = author; // Book author string
        if (featuredImage) updates.featuredImage = featuredImage;
        if (visibility) updates.visibility = visibility;
        if (publicationDate) updates.publicationDate = publicationDate;

        if (tags) {
             try {
                const parsedTags = JSON.parse(tags);
                if (!Array.isArray(parsedTags)) throw new Error();
                // Optional: Validate tag IDs
                updates.tags = parsedTags;
            } catch (e) {
                return res.status(400).json({ error: 'Invalid tags format. Must be a JSON array string.' });
            }
        }


        const updatedBook = await Book.findByIdAndUpdate(bookId, updates, { new: true, runValidators: true })
             .populate('uploader', 'name')
             .populate('tags', 'name');

        res.status(200).json(updatedBook);
    } catch (error) {
        console.error("Error updating book:", error);
        if (error.name === 'ValidationError') {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Server error updating book' });
        }
    }
};


// like/unlike a book by ID
const likeBook = async (req, res) => {
    try {
        const bookId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(bookId)) {
            return res.status(400).json({ error: 'Invalid Book ID format' });
        }
        const userId = req.user._id;

        const book = await Book.findById(bookId);

        if (!book) {
            return res.status(404).json({ message: "Book not found" });
        }

        const likeIndex = book.likes.indexOf(userId);
        let isLiked;

        if (likeIndex !== -1) {
            // Unlike
            book.likes.splice(likeIndex, 1);
            isLiked = false;
            await book.save();
            return res.status(200).json({
                message: "Book unliked successfully",
                likesCount: book.likes.length,
                isLiked: isLiked
            });
        } else {
            // Like
            book.likes.push(userId);
             isLiked = true;
            await book.save();
            return res.status(200).json({
                message: "Book liked successfully",
                likesCount: book.likes.length,
                isLiked: isLiked
            });
        }
    } catch (error) {
        console.error("Error liking/unliking book:", error);
        res.status(500).json({ message: "Server error" });
    }
};


// get number of book likes and user's like status by ID
const getBooklikes = async (req, res) => {
    try {
        const bookId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(bookId)) {
            return res.status(400).json({ error: 'Invalid Book ID format' });
        }
        const userId = req.user._id; // Assuming protect middleware

        const book = await Book.findById(bookId).select('likes visibility'); // Select only needed fields

        if (!book) {
            return res.status(404).json({ message: "Book not found" });
        }


        const isLiked = book.likes.includes(userId);
        const likesCount = book.likes.length;

        return res.status(200).json({ likesCount, isLiked });

    } catch (error) {
        console.error("Error finding number of likes of book:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Delete a book by ID (deletes document and GridFS file)
const deleteBook = async (req, res) => {
    const bookId = req.params.id;
     if (!mongoose.Types.ObjectId.isValid(bookId)) {
        return res.status(400).json({ error: 'Invalid Book ID format' });
    }
    const gfs = getGfs(); // Get GridFS stream instance

    try {
        const book = await Book.findById(bookId).select('file uploader');
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        // Authorization: Only the uploader can delete
        if (!book.uploader.equals(req.user._id)) {
            return res.status(403).json({ message: 'User not authorized to delete this book' });
        }

        // --- Delete the file from GridFS ---
        let fileDeleted = false;
        if (book.file && book.file.id && mongoose.Types.ObjectId.isValid(book.file.id)) {
            const fileObjectId = new mongoose.Types.ObjectId(book.file.id);
            const bucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'BookUploads' });

            try {
                await bucket.delete(fileObjectId);
                console.log(`GridFS file ${fileObjectId} deleted successfully.`);
                fileDeleted = true;
            } catch (gridfsError) {
                 // Log the error but proceed to delete the book record
                 // If the file doesn't exist in GridFS, it might throw an error here
                console.error(`Error deleting file ${fileObjectId} from GridFS:`, gridfsError);
                // Check for specific 'File not found' error if possible to ignore
                if (gridfsError.message.includes('File not found')) {
                     console.warn(`File ${fileObjectId} not found in GridFS, proceeding with book deletion.`);
                     fileDeleted = true; // Consider it handled if not found
                 } else {
                     // For other GridFS errors, maybe halt? Or just log.
                     // Depending on requirements, you might return an error here.
                 }
            }
        } else {
            console.warn(`Book ${bookId} has no valid file reference to delete from GridFS.`);
            fileDeleted = true; // No file to delete, so consider it done.
        }

        await Book.findByIdAndDelete(bookId);

        await Comment.deleteMany({ postId: bookId, postType: 'Book' });

        res.status(200).json({ message: 'Book and associated data deleted successfully' });

    } catch (error) {
        console.error(`Error deleting book ${bookId}:`, error);
        res.status(500).json({ error: 'Server error during book deletion' });
    }
};


module.exports = {
    createBook,
    getAllBooks,
    getBookById,
    getAllBookIdsAndImages,
    getBookDetailsById, 
    updateBook,
    deleteBook,
    likeBook,
    getBooklikes
};

