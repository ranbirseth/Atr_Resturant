import React, { useState } from 'react';
import { Star, X } from 'lucide-react';
import axios from 'axios';
import API_URL from '../config';

const FeedbackModal = ({ orderId, onClose, userId }) => {
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  const tags = ['Food', 'Service', 'Ambience', 'Cleanliness', 'Value'];

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(prev => prev.filter(t => t !== tag));
    } else {
      setSelectedTags(prev => [...prev, tag]);
    }
  };

  const handleSubmit = async () => {
    if (rating === 0) return;
    
    try {
      await axios.post(`${API_URL}/feedback`, {
        orderId,
        userId,
        rating,
        message,
        tags: selectedTags
      });
      setSubmitted(true);
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (error) {
      console.error("Feedback submit error", error);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full animate-in zoom-in duration-300">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Star className="w-8 h-8 text-green-600 fill-current" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800">Thank You!</h3>
            <p className="text-gray-500 mt-2">Your feedback helps us serve you better.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-10 duration-500">
        {/* Header */}
        <div className="bg-orange-50 p-6 text-center border-b border-orange-100 relative">
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                <X size={24} />
            </button>
            <h3 className="text-xl font-bold text-gray-800">Rate your Experience</h3>
            <p className="text-sm text-gray-500 mt-1">How was your meal at Aatreyo Restaurant?</p>
        </div>

        {/* Content */}
        <div className="p-6">
            {/* Stars */}
            <div className="flex justify-center gap-2 mb-6">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button 
                        key={star} 
                        onClick={() => setRating(star)}
                        className={`transition-all transform hover:scale-110 active:scale-95`}
                    >
                        <Star 
                            size={36} 
                            className={`${rating >= star ? 'text-yellow-400 fill-current' : 'text-gray-200'} transition-colors`} 
                        />
                    </button>
                ))}
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 justify-center mb-6">
                {tags.map(tag => (
                    <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-3 py-1 rounded-full text-sm font-medium border transition-all ${
                            selectedTags.includes(tag) 
                            ? 'bg-orange-600 text-white border-orange-600' 
                            : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300'
                        }`}
                    >
                        {tag}
                    </button>
                ))}
            </div>

            {/* Message */}
            <textarea 
                placeholder="Tell us more? (Optional)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[100px] mb-6 resize-none"
            />

            {/* Action */}
            <button
                onClick={handleSubmit}
                disabled={rating === 0}
                className={`w-full py-3 rounded-xl font-bold text-lg transition-all ${
                    rating > 0 
                    ? 'bg-orange-600 text-white shadow-lg shadow-orange-200 hover:bg-orange-700' 
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
            >
                Submit Feedback
            </button>
        </div>
      </div>
    </div>
  );
};

export default FeedbackModal;
