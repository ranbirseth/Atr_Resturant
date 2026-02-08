import React, { useState, useEffect } from 'react';
import { 
  Star, 
  MessageSquare, 
  User, 
  Calendar, 
  Search,
  Filter,
  Package,
  ArrowRight
} from 'lucide-react';
import Card, { CardContent } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { getFeedbacks } from '../services/feedbackService';

const starRange = [1, 2, 3, 4, 5];

export default function Reviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRating, setFilterRating] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      const data = await getFeedbacks();
      setReviews(data);
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredReviews = reviews.filter(review => {
    const ratingMatch = filterRating === 'All' || review.rating === parseInt(filterRating);
    const searchMatch = searchQuery === '' || 
      review.userId?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return ratingMatch && searchMatch;
  });

  const averageRating = reviews.length > 0 
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Customer Reviews</h1>
          <p className="text-textMuted text-sm mt-1">Monitor customer satisfaction and feedback.</p>
        </div>
        <div className="flex items-center space-x-4 bg-bgCard p-2 rounded-2xl shadow-sm border border-borderColor px-4">
          <div className="flex items-center text-amber-400">
            <Star className="w-5 h-5 fill-current" />
            <span className="ml-2 text-xl font-bold text-textPrimary">{averageRating}</span>
          </div>
          <div className="h-8 w-px bg-borderColor"></div>
          <div className="text-sm font-medium text-textSecondary">
            {reviews.length} total reviews
          </div>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b border-borderColor flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-2 overflow-x-auto">
            <span className="text-sm text-textMuted mr-2 flex items-center">
              <Filter className="w-4 h-4 mr-1" /> Rating:
            </span>
            {['All', '5', '4', '3', '2', '1'].map((rating) => (
              <button
                key={rating}
                onClick={() => setFilterRating(rating)}
                className={`px-4 py-2 text-sm font-medium rounded-xl transition-all whitespace-nowrap ${
                  filterRating === rating 
                    ? 'bg-red-900/20 text-red-400' 
                    : 'text-textMuted hover:bg-bgHover'
                }`}
              >
                {rating === 'All' ? 'All' : `${rating} Stars`}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textDisabled w-4 h-4" />
            <input
              type="text"
              placeholder="Search feedback..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-bgMain border border-borderColor rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-textPrimary placeholder-textDisabled"
            />
          </div>
        </div>

        <CardContent className="p-6">
          {loading ? (
            <div className="py-20 text-center text-textMuted">Loading reviews...</div>
          ) : filteredReviews.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-bgSecondary rounded-full flex items-center justify-center mx-auto mb-4 border border-borderColor">
                <MessageSquare className="text-textDisabled" size={32} />
              </div>
              <h3 className="text-textPrimary font-bold text-lg">No reviews found</h3>
              <p className="text-textMuted">Try adjusting your filters or search query.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredReviews.map((review) => (
                <div key={review._id} className="bg-bgSecondary rounded-2xl p-5 border border-borderColor hover:border-primary/50 transition-all flex flex-col h-full">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-bgCard rounded-full flex items-center justify-center text-primary border border-borderColor mr-3">
                        <User size={18} />
                      </div>
                      <div>
                        <h4 className="font-bold text-textPrimary text-sm">{review.userId?.name || 'Guest Customer'}</h4>
                        <div className="flex items-center mt-0.5">
                          {starRange.map((star) => (
                            <Star 
                              key={star} 
                              size={12} 
                              className={`${star <= review.rating ? 'text-amber-400 fill-current' : 'text-textDisabled'}`} 
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </Badge>
                  </div>

                  <p className="text-textSecondary text-sm leading-relaxed mb-4 italic flex-grow">
                    "{review.message || 'No message provided'}"
                  </p>

                  {review.tags && review.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {review.tags.map(tag => (
                        <span key={tag} className="text-[10px] bg-bgCard text-textSecondary px-2 py-1 rounded-lg border border-borderColor font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto pt-4 border-t border-borderColor flex items-center justify-between text-[11px] text-textMuted">
                    <div className="flex items-center">
                      <Package size={14} className="mr-1.5" />
                      <span>{review.orderId?.orderType} {review.orderId?.tableNumber ? `• Table ${review.orderId.tableNumber}` : ''}</span>
                    </div>
                    <div className="flex items-center text-primary font-medium cursor-pointer hover:underline">
                      Order Details <ArrowRight size={12} className="ml-1" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
