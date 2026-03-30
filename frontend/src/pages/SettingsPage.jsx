import { useEffect, useState } from "react";
import axios from "axios";
import { 
  Gear, 
  CurrencyDollar,
  Lightning,
  Fire,
  Check,
  DownloadSimple
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { usePWA } from "@/hooks/usePWA";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SettingsPage() {
  const { installPrompt, handleInstall } = usePWA();
  const [settings, setSettings] = useState({
    labour_rate_per_hour: 10,
    utility_rate_per_hour: 1,
    currency: "CAD",
    currency_symbol: "$"
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await axios.get(`${API}/settings`);
        setSettings(res.data);
      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/settings`, settings);
      toast.success("Settings saved successfully");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-[#5C554D]">Loading...</div>;
  }

  return (
    <div data-testid="settings-page">
      <header className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="text-sm text-[#5C554D] mt-1">
          Configure labour and utility rates for cost calculations
        </p>
      </header>
      
      <div className="p-8 max-w-2xl">
        <div className="card-flat p-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-[#E8E3D9]">
            <div className="w-10 h-10 rounded-lg bg-[#2C1E16]/10 flex items-center justify-center">
              <Gear className="w-5 h-5 text-[#2C1E16]" weight="duotone" />
            </div>
            <div>
              <h2 className="font-outfit font-medium text-lg text-[#1A1A1A]">
                Rate Configuration
              </h2>
              <p className="text-sm text-[#5C554D]">
                These rates are used to calculate labour and utility costs in recipes
              </p>
            </div>
          </div>
          
          {/* Currency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">
                Currency
              </label>
              <Input
                value={settings.currency}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                className="form-input"
                data-testid="currency-input"
              />
            </div>
            <div>
              <label className="form-label">Currency Symbol</label>
              <Input
                value={settings.currency_symbol}
                onChange={(e) => setSettings({ ...settings, currency_symbol: e.target.value })}
                className="form-input"
                data-testid="currency-symbol-input"
              />
            </div>
          </div>
          
          {/* Labour Rate */}
          <div>
            <label className="form-label">
              Labour Rate per Hour
            </label>
            <div className="flex items-center gap-2">
              <span className="text-lg font-medium text-[#5C554D]">{settings.currency_symbol}</span>
              <Input
                type="number"
                step="0.01"
                value={settings.labour_rate_per_hour}
                onChange={(e) => setSettings({ ...settings, labour_rate_per_hour: parseFloat(e.target.value) || 0 })}
                className="form-input max-w-[150px] font-mono"
                data-testid="labour-rate-input"
              />
              <span className="text-sm text-[#5C554D]">per hour</span>
            </div>
            <p className="text-xs text-[#5C554D] mt-1">
              This rate is multiplied by the prep time in recipes to calculate labour cost
            </p>
          </div>
          
          {/* Utility Rate */}
          <div>
            <label className="form-label">
              Utility Rate per Hour
            </label>
            <div className="flex items-center gap-2">
              <span className="text-lg font-medium text-[#5C554D]">{settings.currency_symbol}</span>
              <Input
                type="number"
                step="0.01"
                value={settings.utility_rate_per_hour}
                onChange={(e) => setSettings({ ...settings, utility_rate_per_hour: parseFloat(e.target.value) || 0 })}
                className="form-input max-w-[150px] font-mono"
                data-testid="utility-rate-input"
              />
              <span className="text-sm text-[#5C554D]">per hour</span>
            </div>
            <p className="text-xs text-[#5C554D] mt-1">
              This rate covers electricity, gas, and other utilities based on cooking time
            </p>
          </div>
          
          {/* Example Calculation */}
          <div className="p-4 bg-[#F4F1EA] rounded-lg">
            <p className="text-xs font-bold uppercase tracking-wider text-[#5C554D] mb-3">
              Example Calculation
            </p>
            <p className="text-sm text-[#1A1A1A]">
              For a recipe with <span className="font-mono font-medium">60 minutes</span> prep time:
            </p>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-[#5C554D]">Labour cost:</span>
                <span className="font-mono">{settings.currency_symbol}{(settings.labour_rate_per_hour * 1).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5C554D]">Utility cost:</span>
                <span className="font-mono">{settings.currency_symbol}{(settings.utility_rate_per_hour * 1).toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#E8E3D9] font-medium">
                <span>Total overhead:</span>
                <span className="font-mono">{settings.currency_symbol}{((settings.labour_rate_per_hour + settings.utility_rate_per_hour) * 1).toFixed(2)}</span>
              </div>
            </div>
          </div>
          
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-[#2C1E16] hover:bg-[#3E2A1F] text-white"
            data-testid="save-settings-btn"
          >
            {saving ? (
              "Saving..."
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </div>

        {/* Install App */}
        {installPrompt && (
          <div className="card-flat p-6 mt-6">
            <div className="flex items-center gap-3 pb-4 border-b border-[#E8E3D9]">
              <div className="w-10 h-10 rounded-lg bg-[#C57B57]/10 flex items-center justify-center">
                <DownloadSimple className="w-5 h-5 text-[#C57B57]" weight="duotone" />
              </div>
              <div>
                <h2 className="font-outfit font-medium text-lg text-[#1A1A1A]">
                  Install App
                </h2>
                <p className="text-sm text-[#5C554D]">
                  Install Shadow Cakes as a standalone app on your device
                </p>
              </div>
            </div>
            <Button
              onClick={handleInstall}
              className="w-full mt-4 bg-[#2C1E16] hover:bg-[#3E2A1F] text-white"
              data-testid="install-pwa-btn"
            >
              <DownloadSimple className="w-4 h-4 mr-2" />
              Install Shadow Cakes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
