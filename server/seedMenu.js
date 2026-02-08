require('dotenv').config();
const mongoose = require('mongoose');
const Item = require('./models/Item');

const menuDataPart1 = [
    {
        "id": 1,
        "name": "TOMATO SOUP",
        "price": 99,
        "category": "SOUP",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 2,
        "name": "SWEET CORN SOUP",
        "price": 99,
        "category": "SOUP",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1563379091339-03246963d9d6?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 3,
        "name": "VEG MANCHAOW SOUP",
        "price": 99,
        "category": "SOUP",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 4,
        "name": "VEG HOT AND SOUR SOUP",
        "price": 99,
        "category": "SOUP",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1563379091339-03246963d9d6?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 5,
        "name": "CHICKEN MANCHOW SOUP",
        "price": 119,
        "category": "SOUP",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 6,
        "name": "VEG LAMON CORIANDER SOUP",
        "price": 119,
        "category": "SOUP",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 7,
        "name": "CHICKEN HOT AND SOUR SOUP",
        "price": 129,
        "category": "SOUP",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 8,
        "name": "FRENCH FRIES",
        "price": 99,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 9,
        "name": "PERI PERI FRENCH FRIES",
        "price": 119,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 10,
        "name": "HONEY CHILLI POTATO",
        "price": 119,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 11,
        "name": "VEG CRISPY",
        "price": 119,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1563379091339-03246963d9d6?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 12,
        "name": "CORN SLAT AND PEPPER",
        "price": 149,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1563379091339-03246963d9d6?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 13,
        "name": "GOBI CHILLI DRY",
        "price": 159,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 14,
        "name": "VEG MANCHURIAN",
        "price": 169,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1563379091339-03246963d9d6?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 15,
        "name": "GOBI MANCHURIAN",
        "price": 169,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 16,
        "name": "PANEER CHILLI DRY",
        "price": 199,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 17,
        "name": "PANEER 65",
        "price": 199,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 18,
        "name": "MUSHROOM CHILLI DRY",
        "price": 199,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1563379091339-03246963d9d6?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 19,
        "name": "BABY CORN CRISPY",
        "price": 199,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1563379091339-03246963d9d6?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 20,
        "name": "VEG KUNG PAO",
        "price": 199,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1563379091339-03246963d9d6?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 21,
        "name": "PANEER MANCHURIAN",
        "price": 199,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 22,
        "name": "THREE JEWEL SIZZLER",
        "price": 219,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 25,
        "image": "https://images.unsplash.com/photo-1563379091339-03246963d9d6?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 23,
        "name": "YOKO SIZZLER",
        "price": 219,
        "category": "VEG STARTER",
        "veg": true,
        "estimatedPreparationTime": 25,
        "image": "https://images.unsplash.com/photo-1563379091339-03246963d9d6?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 24,
        "name": "CHICKEN CHILLY DRY",
        "price": 229,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 25,
        "name": "CHICKEN 65",
        "price": 229,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 26,
        "name": "CHICKEN BARBECUE",
        "price": 249,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 25,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 27,
        "name": "CHICKEN CLASSIC",
        "price": 249,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 28,
        "name": "CHICKEN CRISPY",
        "price": 229,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 29,
        "name": "CHICKEN DRUMSTICK SIZZLER",
        "price": 299,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 25,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 30,
        "name": "CHICKEN GARLIC",
        "price": 229,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 31,
        "name": "CHICKEN KFC",
        "price": 349,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 32,
        "name": "CHICKEN KUNG PAO",
        "price": 249,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 33,
        "name": "CHICKEN LOLY-POP 4 Pc, 8 Pc",
        "price": "199, 249",
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 25,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 34,
        "name": "CHICKEN PERI-PERI",
        "price": 229,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 35,
        "name": "CHICKEN POPS",
        "price": 249,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 36,
        "name": "CHICKEN SALT AND PEPPER",
        "price": 299,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 37,
        "name": "CHICKEN TERIYAKI",
        "price": 249,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 38,
        "name": "DRAGON CHICKEN",
        "price": 249,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 39,
        "name": "EGG CHILLI",
        "price": 159,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1578164254266-c9e6c8f5c7e8?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 40,
        "name": "HONEY CHILLI CHICKEN",
        "price": 249,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 41,
        "name": "ROAST CHILY CHICKEN",
        "price": 249,
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 25,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 42,
        "name": "SIZAWAN LOLYPOP 4Pc, 6 Pc",
        "price": "249, 349",
        "category": "NON-VEG STARTER",
        "veg": false,
        "estimatedPreparationTime": 25,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 43,
        "name": "GOBI MANCHURIAN GRAVY",
        "price": 199,
        "category": "MAIN COURSE",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 44,
        "name": "VEG MANCHURIAN GRAVY",
        "price": 199,
        "category": "MAIN COURSE",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1563379091339-03246963d9d6?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 45,
        "name": "PANEER CHILLI GRAVY",
        "price": 219,
        "category": "MAIN COURSE",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 46,
        "name": "MUSHROOM CHILLI GRAVY",
        "price": 229,
        "category": "MAIN COURSE",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1563379091339-03246963d9d6?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 47,
        "name": "PANEER MANCHURIAN GRAVY",
        "price": 229,
        "category": "MAIN COURSE",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 48,
        "name": "BLACK BEAN GRAVY",
        "price": 249,
        "category": "MAIN COURSE",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1563379091339-03246963d9d6?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 49,
        "name": "BUN GARLIC CHILLI GRAVY",
        "price": 249,
        "category": "MAIN COURSE",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1563379091339-03246963d9d6?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 50,
        "name": "CHICKEN CHILLI GRAVY",
        "price": 249,
        "category": "MAIN COURSE",
        "veg": false,
        "estimatedPreparationTime": 25,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 51,
        "name": "CHICKEN MANCHURIAN GRAVY",
        "price": 249,
        "category": "MAIN COURSE",
        "veg": false,
        "estimatedPreparationTime": 25,
        "image": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 52,
        "name": "VEG FRIED RICE",
        "price": 149,
        "category": "RICE",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 53,
        "name": "BUN GARLIC RICE",
        "price": 169,
        "category": "RICE",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 54,
        "name": "LEMON RICE",
        "price": 169,
        "category": "RICE",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 55,
        "name": "VEG GARLIC RICE",
        "price": 169,
        "category": "RICE",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 56,
        "name": "VEG SCHEWAN RICE",
        "price": 169,
        "category": "RICE",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 57,
        "name": "PANEER FRIED RICE",
        "price": 199,
        "category": "RICE",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 58,
        "name": "VEG POT RICE",
        "price": 199,
        "category": "RICE",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 59,
        "name": "PANEER SCHEWAN RICE",
        "price": 219,
        "category": "RICE",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 60,
        "name": "TRIPLE VEG FRIED RICE",
        "price": 219,
        "category": "RICE",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 61,
        "name": "EGG FRIED RICE",
        "price": 149,
        "category": "RICE",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 62,
        "name": "CHICKEN FRIED RICE",
        "price": 169,
        "category": "RICE",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 63,
        "name": "CHICKEN KOREAN RICE",
        "price": 199,
        "category": "RICE",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 64,
        "name": "CHICKEN BUN GARLIC RICE",
        "price": 199,
        "category": "RICE",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 65,
        "name": "CHICKEN LEMON RICE",
        "price": 199,
        "category": "RICE",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 66,
        "name": "CHICKEN SCHEWAN RICE",
        "price": 199,
        "category": "RICE",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 67,
        "name": "CHICKEN POT RICE",
        "price": 249,
        "category": "RICE",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 68,
        "name": "CHICKEN TRIPLE SCHEWAN FRIED RICE",
        "price": 249,
        "category": "RICE",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 69,
        "name": "CHILLI GARLIC NOODLES",
        "price": 149,
        "category": "NOODLES",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 70,
        "name": "PANEER NOODLES",
        "price": 149,
        "category": "NOODLES",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 71,
        "name": "VEG BUN GARLIC NOODLES",
        "price": 129,
        "category": "NOODLES",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 72,
        "name": "VEG CHOWMEIN",
        "price": 99,
        "category": "NOODLES",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 73,
        "name": "VEG HAKKA NOODLES",
        "price": 119,
        "category": "NOODLES",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 74,
        "name": "VEG SCHEZWAN NOODLES",
        "price": 129,
        "category": "NOODLES",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 75,
        "name": "CHICKEN BUN GARLIC NOODLES",
        "price": 229,
        "category": "NOODLES",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 76,
        "name": "CHICKEN CHILLI GARLIC NOODLES",
        "price": 229,
        "category": "NOODLES",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 77,
        "name": "CHICKEN HAKKA NOODLES",
        "price": 209,
        "category": "NOODLES",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 78,
        "name": "CHICKEN HONG-KONG NOODLES",
        "price": 229,
        "category": "NOODLES",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 79,
        "name": "CHICKEN SCHEZWAN NOODLES",
        "price": 229,
        "category": "NOODLES",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 80,
        "name": "EGG NOODLES",
        "price": 199,
        "category": "NOODLES",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400&h=300&fit=crop&crop=center"
    }
];
const menuDataPart2 = [
    {
        "id": 81,
        "name": "EGG SCHEZWAN NOODLES",
        "price": 219,
        "category": "NOODLES",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 82,
        "name": "VEG SPRING ROLL",
        "price": 149,
        "category": "ROLLS",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 83,
        "name": "VEG KATHI ROLL",
        "price": 89,
        "category": "ROLLS",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 84,
        "name": "PANEER KATHI ROLL",
        "price": 99,
        "category": "ROLLS",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 85,
        "name": "PANEER KATHI CHEESE ROLL",
        "price": 119,
        "category": "ROLLS",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 86,
        "name": "CHICKEN KATHI ROLL",
        "price": 129,
        "category": "ROLLS",
        "veg": false,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 87,
        "name": "CHICKEN KATHI CHEESE ROLL",
        "price": 149,
        "category": "ROLLS",
        "veg": false,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 88,
        "name": "EGG ROLL",
        "price": 99,
        "category": "ROLLS",
        "veg": false,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 89,
        "name": "DOUBLE EGG ROLL",
        "price": 109,
        "category": "ROLLS",
        "veg": false,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 90,
        "name": "CHICKEN SPRING ROLL",
        "price": 199,
        "category": "ROLLS",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 91,
        "name": "MARGHERITA PIZZA",
        "price": 119,
        "category": "PIZZA",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 92,
        "name": "PANEER PIZZA",
        "price": 149,
        "category": "PIZZA",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 93,
        "name": "CORN TOMATO CAPSICUM PIZZA",
        "price": 149,
        "category": "PIZZA",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 94,
        "name": "CORN PIZZA",
        "price": 149,
        "category": "PIZZA",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 95,
        "name": "MUSHROOM PIZZA",
        "price": 149,
        "category": "PIZZA",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 96,
        "name": "ONION PIZZA",
        "price": 119,
        "category": "PIZZA",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 97,
        "name": "TOMATO PIZZA",
        "price": 119,
        "category": "PIZZA",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 98,
        "name": "ONION TOMATO PIZZA",
        "price": 129,
        "category": "PIZZA",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 99,
        "name": "CHICKEN PIZZA",
        "price": 169,
        "category": "PIZZA",
        "veg": false,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 100,
        "name": "CHICKEN SCHEZWAN PIZZA",
        "price": 168,
        "category": "PIZZA",
        "veg": false,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 101,
        "name": "FARMHOUSE PIZZA",
        "price": 249,
        "category": "PIZZA",
        "veg": true,
        "estimatedPreparationTime": 20,
        "image": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 102,
        "name": "VEG BURGER",
        "price": 59,
        "category": "BURGER",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 103,
        "name": "PANEER BURGER",
        "price": 69,
        "category": "BURGER",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 104,
        "name": "VEG CHEESE BURGER",
        "price": 69,
        "category": "BURGER",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 105,
        "name": "CHICKEN BURGER",
        "price": 69,
        "category": "BURGER",
        "veg": false,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 106,
        "name": "PANEER CHEESE BURGER",
        "price": 79,
        "category": "BURGER",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 107,
        "name": "CHICKEN CHEESE BURGER",
        "price": 79,
        "category": "BURGER",
        "veg": false,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 108,
        "name": "OMELETTE BURGER",
        "price": 89,
        "category": "BURGER",
        "veg": false,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 109,
        "name": "JUMBO BURGER",
        "price": 99,
        "category": "BURGER",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 110,
        "name": "OMELETTE CHEESE BURGER",
        "price": 99,
        "category": "BURGER",
        "veg": false,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 111,
        "name": "BREAD CHEESE OMELETTE",
        "price": 79,
        "category": "SANDWICH",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 112,
        "name": "BREAD OMELETTE",
        "price": 69,
        "category": "SANDWICH",
        "veg": false,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 113,
        "name": "CHEESE OMELETTE",
        "price": 59,
        "category": "SANDWICH",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 114,
        "name": "CHICKEN CHEESE GRILL SANDWICH",
        "price": 99,
        "category": "SANDWICH",
        "veg": false,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 115,
        "name": "CHICKEN GRILL SANDWICH",
        "price": 89,
        "category": "SANDWICH",
        "veg": false,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 116,
        "name": "EGG SANDWICH",
        "price": 69,
        "category": "SANDWICH",
        "veg": false,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 117,
        "name": "OMELETTE",
        "price": 49,
        "category": "SANDWICH",
        "veg": false,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 118,
        "name": "PANEER CHEESE GRILL SANDWICH",
        "price": 89,
        "category": "SANDWICH",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 119,
        "name": "PANEER GRILL SANDWICH",
        "price": 79,
        "category": "SANDWICH",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 120,
        "name": "VEG CHEESE GRILL SANDWICH",
        "price": 69,
        "category": "SANDWICH",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 121,
        "name": "VEG GRILL SANDWICH",
        "price": 59,
        "category": "SANDWICH",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 122,
        "name": "WHITE SAUCE PASTA",
        "price": 119,
        "category": "PASTA",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 123,
        "name": "RED SAUCE PASTA",
        "price": 119,
        "category": "PASTA",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 124,
        "name": "VEGGI PASTA",
        "price": 119,
        "category": "PASTA",
        "veg": true,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 125,
        "name": "CHICKEN PASTA",
        "price": 149,
        "category": "PASTA",
        "veg": false,
        "estimatedPreparationTime": 15,
        "image": "https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 126,
        "name": "VEG DUM BIRYANI",
        "price": 149,
        "category": "BIRYANI",
        "veg": true,
        "estimatedPreparationTime": 25,
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 127,
        "name": "CHICKEN DUM BIRYANI",
        "price": 199,
        "category": "BIRYANI",
        "veg": false,
        "estimatedPreparationTime": 25,
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 128,
        "name": "MUTTON DUM BIRYANI",
        "price": 299,
        "category": "BIRYANI",
        "veg": false,
        "estimatedPreparationTime": 30,
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 129,
        "name": "CHICKEN HYDERABADI BIRYANI",
        "price": 249,
        "category": "BIRYANI",
        "veg": false,
        "estimatedPreparationTime": 25,
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 130,
        "name": "MUTTON HYDERABADI BIRYANI",
        "price": 349,
        "category": "BIRYANI",
        "veg": false,
        "estimatedPreparationTime": 30,
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 131,
        "name": "CHICKEN LEG BIRYANI",
        "price": 249,
        "category": "BIRYANI",
        "veg": false,
        "estimatedPreparationTime": 25,
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 132,
        "name": "CHOCOLATE",
        "price": "MRP",
        "category": "DESSERT",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1606313564200-75f2d4fa383b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 133,
        "name": "CHOCO LAWA",
        "price": "MRP",
        "category": "DESSERT",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1606313564200-75f2d4fa383b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 134,
        "name": "BROWNIE",
        "price": "MRP",
        "category": "DESSERT",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1606313564200-75f2d4fa383b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 135,
        "name": "BROWNIE WITH ICE-CREAM",
        "price": "MRP",
        "category": "DESSERT",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1606313564200-75f2d4fa383b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 136,
        "name": "BROWNIE WITH CHOCOLATE",
        "price": "MRP",
        "category": "DESSERT",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1606313564200-75f2d4fa383b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 137,
        "name": "PASTRY",
        "price": "MRP",
        "category": "DESSERT",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1606313564200-75f2d4fa383b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 138,
        "name": "CAKE",
        "price": "MRP",
        "category": "DESSERT",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1606313564200-75f2d4fa383b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 139,
        "name": "DOUGHNUTS",
        "price": "MRP",
        "category": "DESSERT",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1606313564200-75f2d4fa383b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 140,
        "name": "HOT GULAB JAMUN",
        "price": 40,
        "category": "DESSERT",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1606313564200-75f2d4fa383b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 141,
        "name": "HOT GULAB JAMUN WITH ICE-CREAM",
        "price": 69,
        "category": "DESSERT",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1606313564200-75f2d4fa383b?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 142,
        "name": "TEA",
        "price": 25,
        "category": "BEVERAGE",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1561047029-3000c68339ca?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 143,
        "name": "LEMON TEA",
        "price": 25,
        "category": "BEVERAGE",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1561047029-3000c68339ca?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 144,
        "name": "COFFEE",
        "price": 45,
        "category": "BEVERAGE",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1561047029-3000c68339ca?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 145,
        "name": "WATER",
        "price": "MRP",
        "category": "BEVERAGE",
        "veg": true,
        "estimatedPreparationTime": 0,
        "image": "https://images.unsplash.com/photo-1561047029-3000c68339ca?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 146,
        "name": "COLD DRINK",
        "price": "MRP",
        "category": "BEVERAGE",
        "veg": true,
        "estimatedPreparationTime": 0,
        "image": "https://images.unsplash.com/photo-1561047029-3000c68339ca?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 147,
        "name": "SOFT DRINK",
        "price": "MRP",
        "category": "BEVERAGE",
        "veg": true,
        "estimatedPreparationTime": 0,
        "image": "https://images.unsplash.com/photo-1561047029-3000c68339ca?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 148,
        "name": "BLACK COFFEE",
        "price": 35,
        "category": "BEVERAGE",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1561047029-3000c68339ca?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 149,
        "name": "MASALA SODA",
        "price": 39,
        "category": "BEVERAGE",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1561047029-3000c68339ca?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 150,
        "name": "MASALA COLD DRINKS",
        "price": 59,
        "category": "BEVERAGE",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1561047029-3000c68339ca?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 151,
        "name": "SALAD",
        "price": 69,
        "category": "SALAD",
        "veg": true,
        "estimatedPreparationTime": 10,
        "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 152,
        "name": "VANILLA ICE CREAM",
        "price": 49,
        "category": "ICE CREAM",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 153,
        "name": "CHOCOLATE ICE CREAM",
        "price": 49,
        "category": "ICE CREAM",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 154,
        "name": "BUTTERSCOTCH ICE CREAM",
        "price": 49,
        "category": "ICE CREAM",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&crop=center"
    },
    {
        "id": 155,
        "name": "STRAWBERRY ICE CREAM",
        "price": 49,
        "category": "ICE CREAM",
        "veg": true,
        "estimatedPreparationTime": 5,
        "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&crop=center"
    }
];
const menuData = [...menuDataPart1, ...menuDataPart2];

const seedDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        const itemsToInsert = menuData.map(item => {
            let price = 0;
            if (typeof item.price === 'number') {
                price = item.price;
            } else if (typeof item.price === 'string') {
                if (item.price === 'MRP') {
                    price = 0;
                } else if (item.price.includes(',')) {
                    // "199, 249" -> take first
                    price = parseInt(item.price.split(',')[0].trim());
                } else if (!isNaN(parseInt(item.price))) {
                    price = parseInt(item.price);
                }
            }

            return {
                name: item.name,
                category: item.category,
                price: price, // Handled logic
                isVeg: item.veg, // Mapped from 'veg'
                estimatedPreparationTime: item.estimatedPreparationTime,
                image: item.image,
                description: item.name // Description missing in new JSON, use name or empty
            };
        });

        // Clear existing items
        await Item.deleteMany({});
        console.log('Items cleared!');

        // Insert new items
        if (itemsToInsert.length > 0) {
            await Item.insertMany(itemsToInsert);
            console.log(`Inserted ${itemsToInsert.length} items`);
        } else {
            console.log('No items to insert.');
        }

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedDB();
