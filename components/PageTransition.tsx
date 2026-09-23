'use client';

import { motion } from 'framer-motion';

export function PageTransition({
  children,
  routeKey,
}: {
  children: React.ReactNode;
  routeKey: string;
}) {
  return (
    <motion.div
      key={routeKey}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="relative"
    >
      {children}
    </motion.div>
  );
}
