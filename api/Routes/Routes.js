const express = require('express');

const { 
    createBlog, getAllBlogs, getBlogById, updateBlog, deleteBlog, likeBlog, getBloglikes,
} = require('../Controllers/BlogControllers');

const { 
    addComment, getCommentsForBlog, getCommentsForBook, updateComment, deleteComment 
} = require('../Controllers/CommentControllers');

const { 
    createTag, getTags, updateTag, deleteTag 
} = require('../Controllers/TagControllers');

const { 
    registerUser, loginUser, getInfo, updateProfile
} = require('../Controllers/UserControllers');

const {
    createBook, getAllBooks, getBookById, getBookDetailsById, updateBook, deleteBook, getAllBookIdsAndImages, likeBook, getBooklikes
} = require('../Controllers/BookControllers');


const { protect, authorizeAsAuthor } = require('../middlewares/authMiddleware');

const router = express.Router();
const upload = require("../config/multer")


// Blog Routes
router.route('/blogs')
    .post(protect, authorizeAsAuthor, createBlog)
    .get(getAllBlogs);

router.route('/blogs/:id')
    .get(getBlogById)
    .put(protect, authorizeAsAuthor, updateBlog)
    .delete(protect, authorizeAsAuthor, deleteBlog);

router.route('/blogs/:id/like')
    .post(protect, likeBlog)
    .get(protect, getBloglikes);

// Book Routes
router.route('/books')
    .post(protect, authorizeAsAuthor, upload.single("bookfile"), createBook)
    .get(getAllBooks); 

router.route('/booksHomePage')
    .get(getAllBookIdsAndImages); 

router.route('/books/:id/like')
    .post(protect, likeBook)
    .get(protect, getBooklikes)

router.route('/books/:id/download') 
    .get(getBookById);

router.route('/books/:id/details') // Specific route for metadata
    .get(getBookDetailsById)
    .put(protect, authorizeAsAuthor, updateBook)
    .delete(protect, authorizeAsAuthor, deleteBook);

// Comment Routes
router.route('/comments')
    .post(protect, addComment);

router.route('/comments/:blogId')
    .get(getCommentsForBlog);  // Supports ?page= & ?limit=

router.route('/comments/book/:bookId')
    .get(getCommentsForBook)  // Supports ?page= & ?limit=

router.route('/comments/:commentId')
    .put(protect, updateComment)
    .delete(protect, deleteComment);


// Tag Routes
router.route('/tags')
    .post(protect, createTag)
    .get(getTags)
    .put(protect, updateTag)
    .delete(protect, deleteTag);



// User Routes
router.route('/users/register')
    .post(registerUser);

router.route('/users/login')
    .post(loginUser);

router.route('/users/me')
    .get(protect, getInfo)
    .put(protect, updateProfile);

module.exports = router;
