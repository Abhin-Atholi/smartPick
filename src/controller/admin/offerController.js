import * as offerService from '../../services/admin/offerService.js';

export const getOffers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const { search, offerType, status } = req.query;

        const [result, products, categories] = await Promise.all([
            offerService.getOffers({ search, offerType, status, page, limit }),
            offerService.getProductsForSelect(),
            offerService.getCategoriesForSelect()
        ]);

        res.render('admin/offers', {
            title: 'Offer Management',
            offers: result.offers,
            currentPage: page,
            totalPages: result.totalPages,
            search: search || '',
            offerType: offerType || '',
            status: status || '',
            products,
            categories,
            activePath: '/admin/offers'
        });
    } catch (error) {
        console.error('getOffers Error:', error);
        res.status(500).render('admin/offers', {
            title: 'Offer Management',
            offers: [], currentPage: 1, totalPages: 1,
            search: '', offerType: '', status: '',
            products: [], categories: []
        });
    }
};

export const addOffer = async (req, res) => {
    try {
        await offerService.createOffer(req.body);
        res.status(201).json({ success: true, message: 'Offer created successfully!' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const editOffer = async (req, res) => {
    try {
        await offerService.updateOffer(req.params.id, req.body);
        res.status(200).json({ success: true, message: 'Offer updated successfully!' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const toggleOffer = async (req, res) => {
    try {
        const offer = await offerService.toggleOffer(req.params.id);
        res.status(200).json({
            success: true,
            message: `Offer ${offer.isActive ? 'activated' : 'deactivated'} successfully!`,
            isActive: offer.isActive
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const deleteOffer = async (req, res) => {
    try {
        await offerService.deleteOffer(req.params.id);
        res.status(200).json({ success: true, message: 'Offer deleted successfully!' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
