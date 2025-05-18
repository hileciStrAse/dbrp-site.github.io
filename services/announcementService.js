const Announcement = require('../models/Announcement');

class AnnouncementService {
    // Yeni elan əlavə etmək
    static async createAnnouncement(title, message) {
        try {
            const announcement = new Announcement({ title, message });
            await announcement.save();
            return announcement;
        } catch (error) {
            console.error('Elan yaradılarkən xəta:', error);
            throw error;
        }
    }

    // Bütün elanları əldə etmək
    static async getAllAnnouncements() {
        try {
            return await Announcement.find().sort({ date: -1 });
        } catch (error) {
            console.error('Elanlar əldə edilərkən xəta:', error);
            throw error;
        }
    }

    // Elanı ID-yə görə silmək
    static async deleteAnnouncement(id) {
        try {
            const result = await Announcement.findByIdAndDelete(id);
            return result;
        } catch (error) {
            console.error('Elan silinərkən xəta:', error);
            throw error;
        }
    }

    // Bütün elanları silmək (ehtiyac olarsa)
    static async deleteAllAnnouncements() {
        try {
            const result = await Announcement.deleteMany({});
            return result;
        } catch (error) {
            console.error('Bütün elanlar silinərkən xəta:', error);
            throw error;
        }
    }
}

module.exports = AnnouncementService; 
