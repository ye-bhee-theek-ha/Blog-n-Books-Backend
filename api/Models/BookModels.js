const mongoose = require("mongoose");

const BookSchema = mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        required: true,
        trim: true,
    },
    author: {
        type: String,
        required: true,
        trim: true,
    },
    uploader: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    publicationDate: { 
        type: Date,
    },
    uploadDate: {
        type: Date,
        default: Date.now,
    },
    tags: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tag',
    }],
    visibility: {
        type: String,
        enum: ['public', 'private'],
        default: 'public',
    },
    comments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
    }],
    featuredImage: {
        type: String,
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    file: {
        filename: String,
        id: mongoose.Schema.Types.ObjectId,
    },
});

BookSchema.index({ title: 'text', description: 'text', author: 'text' });

const Book = mongoose.model("Book", BookSchema);
module.exports = Book;
