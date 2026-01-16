import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export default function ScrollToTop() {
    const { pathname } = useLocation();
    const navType = useNavigationType();

    useEffect(() => {
        // "POP" means back/forward button. We want to keep scroll position there (native browser behavior).
        // "PUSH" or "REPLACE" means new navigation. We want to scroll to top.
        if (navType !== 'POP') {
            window.scrollTo(0, 0);
        }
    }, [pathname, navType]);

    return null;
}
