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
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);
    return (
        <dialog
            ref={ref}
            aria-labelledby={labelledBy}
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={(event) => {
                if (event.target === ref.current) onClose();
            }}
        >
            {open && children}
        </dialog>
    );
}
