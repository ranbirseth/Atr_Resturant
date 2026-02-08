export const findUpsellItem = (originalItem, menuItems) => {
    if (!menuItems || menuItems.length === 0 || !originalItem) return null;

    let targetItem = null;

    const originalCategory = originalItem.category ? originalItem.category.toUpperCase() : '';
    const originalName = originalItem.name ? originalItem.name.toUpperCase() : '';

    // Helper to find item by exact name match (partial) case-insensitive
    const findByName = (namePart) => menuItems.find(i => i.name && i.name.toUpperCase().includes(namePart.toUpperCase()));
    // Helper to find item by category
    const findByCategory = (cat) => menuItems.find(i => i.category && i.category.toUpperCase() === cat.toUpperCase());
    // Helper to find by category excluding current ID (though usually category diff means ID diff, but good safety)
    // const findByCategoryExclude = (cat) => menuItems.find(i => i.category && i.category.toUpperCase() === cat.toUpperCase() && i._id !== originalItem._id);

    // --- EXTENSIVE MATCHING LOGIC ---

    // 1. PIZZA (or Starters as proxy) -> Cold Drink > Soup
    if (originalCategory.includes('PIZZA') || originalCategory.includes('STARTER')) {
        targetItem = findByName('COLD DRINK');
        if (!targetItem) targetItem = findByCategory('BEVERAGE');
        if (!targetItem) targetItem = findByCategory('SOUP');
    }

    // 2. RICE -> Manchurian > Soup > Gravy
    else if (originalCategory.includes('RICE')) {
        targetItem = findByName('MANCHURIAN'); // Prefers "Veg Manchurian Gravy" etc
        if (!targetItem) targetItem = findByCategory('SOUP');
    }

    // 3. NOODLES -> Manchurian > Spring Roll > Soup
    else if (originalCategory.includes('NOODLES')) {
        targetItem = findByName('MANCHURIAN');
        if (!targetItem) targetItem = findByName('SPRING ROLL');
        if (!targetItem) targetItem = findByCategory('SOUP');
    }

    // 4. BURGER / SANDWICH -> Cold Drink > Soup
    else if (originalCategory.includes('BURGER') || originalCategory.includes('SANDWICH')) {
        targetItem = findByName('COLD DRINK');
        if (!targetItem) targetItem = findByCategory('SOUP');
    }

    // 5. BIRYANI -> Soup
    else if (originalCategory.includes('BIRYANI')) {
        targetItem = findByCategory('SOUP');
    }

    // 6. MAIN COURSE (GRAVY) -> Rice > Noodles
    else if (originalCategory === 'MAIN COURSE' || originalName.includes('GRAVY')) {
        targetItem = findByCategory('RICE');
        if (!targetItem) targetItem = findByCategory('NOODLES');
    }

    // 7. SALAD -> Soup > Spring Roll
    else if (originalCategory === 'SALAD') {
        targetItem = findByCategory('SOUP');
        if (!targetItem) targetItem = findByName('SPRING ROLL');
    }

    // 8. PASTA -> Soup
    else if (originalCategory.includes('PASTA')) {
        targetItem = findByCategory('SOUP');
    }

    // Fallback: Random Beverage/Dessert
    if (!targetItem) {
        const candidates = menuItems.filter(i => {
            const cat = i.category ? i.category.toUpperCase() : '';
            return (cat === 'BEVERAGE' || cat === 'DESSERT') && i._id !== originalItem._id;
        });
        if (candidates.length > 0) {
            targetItem = candidates[Math.floor(Math.random() * candidates.length)];
        }
    }

    return targetItem;
};
