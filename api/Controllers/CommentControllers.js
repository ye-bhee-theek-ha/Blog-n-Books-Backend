const Comment = require("../Models/CommentModels");
const Blog = require("../Models/BlogModels");
const Book = require("../Models/BookModels"); 
const mongoose = require('mongoose');

const addComment = async (req, res) => {
    try {
        const { postId, postType, content } = req.body;
        const authorId = req.user._id; 

        // --- Validation ---
        if (!postId || !postType || !content || typeof content !== 'string' || content.trim() === '') {
            return res.status(400).json({ message: "postId, postType, and non-empty content are required." });
        }
        if (!['Blog', 'Book'].includes(postType)) {
            return res.status(400).json({ message: "Invalid postType. Must be 'Blog' or 'Book'." });
        }
        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ error: 'Invalid Post ID format' });
        }

        // --- Check if parent post exists and is commentable ---
        let parentPost;
        if (postType === 'Blog') {
            parentPost = await Blog.findOne({ _id: postId, visibility: 'public', status: 'Published' }).select('_id comments');
        } else { // postType === 'Book'
            parentPost = await Book.findOne({ _id: postId, visibility: 'public' }).select('_id comments');
        }

        if (!parentPost) {
            return res.status(404).json({ message: `${postType} not found or not available for comments` });
        }

        // --- Create and save comment ---
        const newComment = new Comment({
            content: content.trim(),
            author: authorId,
            postId: postId,
            postType: postType,
        });
        const savedComment = await newComment.save();

        // --- Add comment reference to parent post ---
        parentPost.comments.push(savedComment._id);
        await parentPost.save();

        // --- Populate and return ---
        const populatedComment = await Comment.findById(savedComment._id)
            .populate('author', 'name profilePic'); // Populate author details

        res.status(201).json({ message: "Comment added successfully", comment: populatedComment });

    } catch (error) {
        console.error("Error adding comment:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Generic function to get comments (used by specific getters)
const getCommentsInternal = async (postId, postType, page, limit) => {
    const skip = (page - 1) * limit;

    const commentsQuery = Comment.find({ postId: postId, postType: postType })
        .populate('author', 'name profilePic') // Populate author details
        .sort({ createdAt: 1 }) // Sort by oldest first
        .skip(skip)
        .limit(limit);

    const totalCommentsQuery = Comment.countDocuments({ postId: postId, postType: postType });

    const [comments, totalComments] = await Promise.all([commentsQuery, totalCommentsQuery]);

    const totalPages = Math.ceil(totalComments / limit);

    return {
        comments,
        pagination: {
            currentPage: page,
            totalPages,
            totalItems: totalComments,
            limit
        }
    };
};

// Get comments for a specific Blog Post (with Pagination)
const getCommentsForBlog = async (req, res) => {
    try {
        const blogId = req.params.blogId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10; // Default limit 10

        if (!mongoose.Types.ObjectId.isValid(blogId)) {
            return res.status(400).json({ error: 'Invalid Blog ID format' });
        }

        // Optional: Check if blog exists before fetching comments
        const blogExists = await Blog.findById(blogId).select('_id');
        if (!blogExists) {
            return res.status(404).json({ message: 'Blog post not found' });
        }

        const result = await getCommentsInternal(blogId, 'Blog', page, limit);
        res.status(200).json(result);

    } catch (error) {
        console.error("Error getting blog comments:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

// Get comments for a specific Book (with Pagination)
const getCommentsForBook = async (req, res) => {
    try {
        const bookId = req.params.bookId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10; // Default limit 10

        if (!mongoose.Types.ObjectId.isValid(bookId)) {
            return res.status(400).json({ error: 'Invalid Book ID format' });
        }

        // Optional: Check if book exists before fetching comments
        const bookExists = await Book.findById(bookId).select('_id');
        if (!bookExists) {
            return res.status(404).json({ message: 'Book not found' });
        }

        const result = await getCommentsInternal(bookId, 'Book', page, limit);
        res.status(200).json(result);

    } catch (error) {
        console.error("Error getting book comments:", error);
        res.status(500).json({ error: "Server Error" });
    }
};


// Update a comment
const updateComment = async (req, res) => {
    try {
        const commentId = req.params.commentId;
        const { content } = req.body;

        if (!mongoose.Types.ObjectId.isValid(commentId)) {
            return res.status(400).json({ error: 'Invalid Comment ID format' });
        }
        if (!content || typeof content !== 'string' || content.trim() === '') {
            return res.status(400).json({ message: "Non-empty content is required." });
        }

        const comment = await Comment.findById(commentId);

        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }

        // Authorization: Only the author can update
        if (!comment.author.equals(req.user._id)) {
            return res.status(403).json({ message: "User not authorized to update this comment" });
        }

        comment.content = content.trim();
        comment.updatedAt = Date.now(); // Handled by timestamps: true

        const updatedComment = await comment.save();
        const populatedComment = await Comment.findById(updatedComment._id)
            .populate('author', 'name profilePic'); // Repopulate

        res.status(200).json(populatedComment);
    } catch (error) {
        console.error("Error updating comment:", error);
        if (error.name === 'ValidationError') {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: "Server error" });
        }
    }
};

// Delete a comment
const deleteComment = async (req, res) => {
    try {
        const commentId = req.params.commentId;
        if (!mongoose.Types.ObjectId.isValid(commentId)) {
            return res.status(400).json({ error: 'Invalid Comment ID format' });
        }

        const comment = await Comment.findById(commentId);

        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }

        // Authorization: Allow comment author OR post author/uploader OR admin to delete
        let canDelete = false;
        if (comment.author.equals(req.user._id)) {
            canDelete = true;
        } else {
            // Check if user is the author of the parent post
            if (comment.postType === 'Blog') {
                const blog = await Blog.findById(comment.postId).select('author');
                if (blog && blog.author.equals(req.user._id)) canDelete = true;
            } else if (comment.postType === 'Book') {
                const book = await Book.findById(comment.postId).select('uploader');
                if (book && book.uploader.equals(req.user._id)) canDelete = true;
            }
            // Add admin check here: else if (req.user.role === 'admin') canDelete = true;
        }

        if (!canDelete) {
            return res.status(403).json({ message: "User not authorized to delete this comment" });
        }

        // Remove comment ID from the associated parent post
        const parentModel = comment.postType === 'Blog' ? Blog : Book;
        await parentModel.findByIdAndUpdate(comment.postId, {
            $pull: { comments: commentId }
        });

        // Delete the comment itself
        await Comment.findByIdAndDelete(commentId);

        res.status(200).json({ message: "Comment deleted successfully" });

    } catch (error) {
        console.error("Error deleting comment:", error);
        res.status(500).json({ error: "Server error" });
    }
};

module.exports = {
    addComment,
    getCommentsForBlog,
    getCommentsForBook,
    updateComment,
    deleteComment
};
