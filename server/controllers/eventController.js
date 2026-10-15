const sendError = require('../utils/httpError');
const Event = require('../models/Event');
const mongoose = require('mongoose');
const appError = require('../utils/appError');

//get all events
exports.getAllEvents = async (req, res) => {
    try{
        const filters={};
        if(req.query.search){
            if (typeof req.query.search !== 'string') return res.status(400).json({ message: 'Invalid search' });
            const searchRegex = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filters.$or = [
                {title: searchRegex},
                {description: searchRegex},
                {category: searchRegex},
                {location: searchRegex}
            ];
        }
        if(req.query.category){
            filters.category=req.query.category;
        }
        if(req.query.location){
            filters.location=req.query.location;
        }
        if(req.query.ticketPrice){
            filters.ticketPrice=req.query.ticketPrice;
        }

        const events=await Event.find(filters);
        res.json(events);
    }catch(error){
        return sendError(res, error);
    }
}


exports.getEventById=async(req,res)=>{
    try{
        const event =await Event.findById(req.params.id);
        if(!event){
            return res.status(404).json({error: "event not found"})
        }
        res.json(event);
    }catch(error){
        return sendError(res, error);
    }
};


exports.createEvent = async (req, res) => {
    const {
        title,
        description,
        date,
        location,
        category,
        totalSeats,
        ticketPrice,
        imageUrl
    } = req.body || {};

    try {
        const event = await Event.create({
            title,
            description,
            date,
            location,
            category,
            totalSeats,
            availableSeats: totalSeats,
            ticketPrice,
            imageUrl,
            createdBy: req.user._id
        });

        res.status(201).json({
            message: 'Event created successfully',
            event
        });

    } catch (error) {
        return sendError(res, error);
    }
};

exports.updateEvent=async(req,res)=>{
    try {
        const event = await mongoose.connection.transaction(async session => {
            const current = await Event.findById(req.params.id).session(session);
            if (!current) throw appError(404, 'Event not found');
            const body = req.body || {};
            if (body.totalSeats !== undefined) {
                const capacity = Number(body.totalSeats);
                const confirmedSeats = current.totalSeats - current.availableSeats;
                if (!Number.isInteger(capacity) || capacity < confirmedSeats || capacity < 0) {
                    throw appError(400, 'Capacity must be a non-negative integer and cover all confirmed bookings');
                }
                current.totalSeats = capacity;
                current.availableSeats = capacity - confirmedSeats;
            }
            for (const field of ['title', 'description', 'date', 'location', 'category', 'ticketPrice', 'imageUrl']) {
                if (body[field] !== undefined) current[field] = body[field];
            }
            await current.save({ session });
            return current;
        });
        res.json(event);
    } catch (error) {
        return sendError(res, error);
    }
};

exports.deleteEvent=async(req,res)=>{
    try{
        const event = await Event.findByIdAndDelete(req.params.id);
        if(!event){
            return res.status(404).json({error: "Event not found"});
        }
        res.json({message: "Event deleted successfully"});
    }catch(error){
        return sendError(res, error);
    }
};
