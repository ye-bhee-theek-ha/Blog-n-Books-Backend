const mongoose = require("mongoose");

const CommentSchema = mongoose.Schema({
    content: {
        type: String,
        required: true,
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    postId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    postType: {
        type: String,
        required: true,
        enum: ['Blog', 'Book'],
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

CommentSchema.index({ postId: 1, postType: 1 });


const Comment = mongoose.model("Comment", CommentSchema);
module.exports = Comment;
