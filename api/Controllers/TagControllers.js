const Tag = require("../Models/TagModels");
const mongoose = require('mongoose');


const createTag = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: "Tag name is required." });
        }

        const tagName = name.trim().toLowerCase(); // Standardize name

        // Check if the tag already exists
        const existingTag = await Tag.findOne({ name: tagName });

        if (existingTag) {
            // Return existing tag instead of error? Depends on desired UX
            return res.status(409).json({ error: "Tag already exists", tag: existingTag }); // 409 Conflict
        }

        const newTag = new Tag({ name: tagName });
        await newTag.save();
        res.status(201).json(newTag);

    } catch (error) {
         console.error("Error creating tag:", error);
         if (error.name === 'ValidationError') {
             res.status(400).json({ error: error.message });
         } else {
             res.status(500).json({ error: "Server Error" });
         }
    }
};

// Get all tags
const getTags = async (req, res) => {
    try {
        const tags = await Tag.find().sort({ name: 1 }); // Sort alphabetically
        res.status(200).json(tags);
    } catch (error) {
         console.error("Error getting tags:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

// Update a tag (Restrict to Admins)
const updateTag = async (req, res) => {
    try {
        const tagId = req.params.tagId;
         if (!mongoose.Types.ObjectId.isValid(tagId)) {
            return res.status(400).json({ error: 'Invalid Tag ID format' });
         }
         const { name } = req.body;
         if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: "Tag name is required." });
         }
         const tagName = name.trim().toLowerCase();

         // Check if new name conflicts with another existing tag
         const existingTag = await Tag.findOne({ name: tagName, _id: { $ne: tagId } });
         if (existingTag) {
             return res.status(409).json({ error: `Tag with name '${tagName}' already exists.` });
         }


        const updatedTag = await Tag.findByIdAndUpdate(
            tagId,
            { name: tagName },
            { new: true, runValidators: true }
        );

         if (!updatedTag) {
            return res.status(404).json({ message: 'Tag not found' });
         }

        res.status(200).json(updatedTag);
    } catch (error) {
         console.error("Error updating tag:", error);
         if (error.name === 'ValidationError') {
             res.status(400).json({ error: error.message });
         } else {
             res.status(500).json({ error: "Server Error" });
         }
    }
};

// Delete a tag (Restrict to Admins)
const deleteTag = async (req, res) => {
    try {
        const tagId = req.params.tagId;
        if (!mongoose.Types.ObjectId.isValid(tagId)) {
            return res.status(400).json({ error: 'Invalid Tag ID format' });
         }

        // Optional: Before deleting, remove this tag from all Blogs/Books
        await Blog.updateMany({ tags: tagId }, { $pull: { tags: tagId } });
        await Book.updateMany({ tags: tagId }, { $pull: { tags: tagId } });

        const deletedTag = await Tag.findByIdAndDelete(tagId);

         if (!deletedTag) {
            return res.status(404).json({ message: 'Tag not found' });
         }

        res.status(200).json({ message: "Tag deleted successfully" }); // Confirmation message
    } catch (error) {
         console.error("Error deleting tag:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

module.exports = {
    createTag,
    getTags,
    updateTag,
    deleteTag 
};