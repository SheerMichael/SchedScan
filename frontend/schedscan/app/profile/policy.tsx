import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { router } from "expo-router";

const Policy = () => {

    return (
    <>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} className="p-5">
            
        <TouchableOpacity className="mb-4 pl-2" onPress={() => router.back()}>
            <ArrowLeft size={26} color="black" strokeWidth={2} />
        </TouchableOpacity>
        
        <Text className="text-2xl font-bold text-slate-900 mb-4">Privacy Policy</Text>
        
        <Text className="text-sm leading-5 text-slate-600 mb-4">
          <Text className="font-bold text-black">SchedScan</Text> is committed to protecting your privacy. We only collect data that you explicitly provide through registration or by scanning your <Text className="font-bold text-black">Certificate of Registration (COR)</Text>. This information includes your name, email address, and academic schedule.
        </Text>

        <Text className="text-sm leading-5 text-slate-600 mb-4">
          We do not sell or distribute your personal data to third parties. All information is stored in a secure database with access strictly limited to authorized personnel. This ensures that your schedule remains private and is used solely to enhance your experience within the app.
        </Text>

        <View className="h-[1px] bg-slate-200 my-6" />

        <Text className="text-2xl font-bold text-slate-900 mb-4">Terms of Service</Text>

        <Text className="text-lg font-bold text-slate-800 mt-2 mb-1">1. Acceptance of Terms</Text>
        <Text className="text-sm leading-5 text-slate-600 mb-4">
          By creating an account or using SchedScan, you agree to be bound by these Terms of Service.
        </Text>

        <Text className="text-lg font-bold text-slate-800 mt-2 mb-1">2. Schedule Scanning & Accuracy</Text>
        <Text className="text-sm leading-5 text-slate-600 mb-4">
          While our scanning technology strives for high precision, SchedScan does not guarantee 100% accuracy. It is your responsibility to verify that the scanned data matches your official school records.
        </Text>

        <Text className="text-lg font-bold text-slate-800 mt-2 mb-1">3. User Conduct</Text>
        <Text className="text-sm leading-5 text-slate-600 mb-4">
          You agree not to upload documents that do not belong to you or attempt to bypass the security of the SchedScan database.
        </Text>

        <Text className="text-lg font-bold text-slate-800 mt-2 mb-1">4. Limitation of Liability</Text>
        <Text className="text-sm leading-5 text-slate-600 mb-4">
          SchedScan is provided "as-is." We are not liable for any academic discrepancies or missed classes resulting from scanning errors or system downtime.
        </Text>
        
        <View className="h-[1px] bg-slate-200 my-6" />
        <Text className="text-2xl font-bold text-slate-900 mb-4">Fair Use & Credits</Text>
        <Text className="text-sm leading-5 text-slate-600 mb-4">
          SchedScan utilizes open-source assets and third-party libraries under Fair Use and their respective licenses:
        </Text>

        <View className="bg-slate-50 p-4 rounded-xl border border-slate-100">
          <Text className="text-sm text-slate-800 mb-2">
            • <Text className="font-bold">Lucide Icons:</Text> Used for interface components under the ISC License.
          </Text>
          <Text className="text-sm text-slate-800 mb-2">
            • <Text className="font-bold">unDraw Illustrations:</Text> Visual assets are provided by unDraw.co under the unDraw License.
          </Text>
          <Text className="text-sm text-slate-800">
            • <Text className="font-bold">Software Components:</Text> This application is built using React Native and NativeWind.
          </Text>
        </View>

        <Text className="text-xs text-slate-400 mt-6 text-center italic">
          Last Updated: March 2026
        </Text>
      </ScrollView>
    </>
    );
};

export default Policy;
    