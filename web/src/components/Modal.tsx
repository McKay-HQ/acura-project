import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    labelledBy?: string;
}

// Native <dialog> wrapper: Escape and backdrop clicks close it.
export default function Modal({ open, onClose, children, labelledBy }: ModalProps) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const d = ref.current;
        if (!d) return;
        if (open && !d.open) d.showModal();
        if (!open && d.open) d.close();
    }, [open]);
    return (
        <dialog
            ref={ref}
            aria-labelledby={labelledBy}
            onCancel={(e) => {
                e.preventDefault();
                onClose();
            }}
            onClick={(e) => {
                if (e.target === ref.current) onClose();
            }}
        >
            {open && children}
        </dialog>
    );
}
