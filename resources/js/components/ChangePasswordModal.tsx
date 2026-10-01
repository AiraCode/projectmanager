import { useState, useEffect } from 'react';
import { useForm, usePage } from '@inertiajs/react';
import { Modal, Button, Toast } from '@/components/ui';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const InputField = ({ label, type, value, onChange, error, required }: any) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[13px] font-semibold text-neutral-700">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input
      type={type}
      value={value}
      onChange={onChange}
      required={required}
      className={`px-3 py-2 text-[13px] bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 transition-all ${
        error ? 'border-red-500 focus:border-red-500' : 'border-neutral-200 focus:border-brand'
      }`}
    />
    {error && <span className="text-[11px] text-red-500">{error}</span>}
  </div>
);

export default function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const { data, setData, put, processing, errors, reset, clearErrors } = useForm({
    current_password: '',
    password: '',
    password_confirmation: '',
  });

  const { props } = usePage();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const isPasswordValid = data.password.length >= 8 && /[a-zA-Z]/.test(data.password) && /[0-9]/.test(data.password);
  const isPasswordMatch = data.password === data.password_confirmation && data.password.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    put('/profile/password', {
      onSuccess: () => {
        reset();
        onClose();
        setToastMessage('Password berhasil diubah.');
        setShowToast(true);
      },
    });
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => {
          reset();
          clearErrors();
          onClose();
        }}
        title="Ganti Password"
        subtitle="Perbarui password akun Anda"
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <InputField
            label="Password Saat Ini"
            type="password"
            value={data.current_password}
            onChange={(e: any) => setData('current_password', e.target.value)}
            error={errors.current_password}
            required
          />
          
          <div>
            <InputField
              label="Password Baru"
              type="password"
              value={data.password}
              onChange={(e: any) => setData('password', e.target.value)}
              error={errors.password}
              required
            />
            {data.password.length > 0 && (
              <div className={`text-[11px] font-medium mt-1.5 flex items-center gap-1 ${
                isPasswordValid ? 'text-emerald-600' : 'text-red-500'
              }`}>
                {isPasswordValid ? (
                  <>
                    <div className="w-3 h-3 rounded-full bg-emerald-100 flex items-center justify-center">✓</div>
                    <span>Password sudah memenuhi syarat (min. 8 karakter, huruf & angka)</span>
                  </>
                ) : (
                  <>
                    <div className="w-3 h-3 rounded-full bg-red-100 flex items-center justify-center">!</div>
                    <span>Password harus berisi minimal 8 karakter, huruf, dan angka.</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div>
            <InputField
              label="Konfirmasi Password Baru"
              type="password"
              value={data.password_confirmation}
              onChange={(e: any) => setData('password_confirmation', e.target.value)}
              error={errors.password_confirmation}
              required
            />
            {data.password_confirmation.length > 0 && (
              <div className={`text-[11px] font-medium mt-1.5 flex items-center gap-1 ${
                isPasswordMatch ? 'text-emerald-600' : 'text-red-500'
              }`}>
                {isPasswordMatch ? (
                  <>
                    <div className="w-3 h-3 rounded-full bg-emerald-100 flex items-center justify-center">✓</div>
                    <span>Password cocok</span>
                  </>
                ) : (
                  <>
                    <div className="w-3 h-3 rounded-full bg-red-100 flex items-center justify-center">!</div>
                    <span>Password tidak cocok</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                clearErrors();
                onClose();
              }}
              disabled={processing}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={processing || data.password.length === 0 || !isPasswordValid || !isPasswordMatch}
            >
              {processing ? 'Menyimpan...' : 'Simpan Password'}
            </Button>
          </div>
        </form>
      </Modal>
      {showToast && (
        <Toast
          message={toastMessage}
          type="success"
          onClose={() => setShowToast(false)}
        />
      )}
    </>
  );
}
