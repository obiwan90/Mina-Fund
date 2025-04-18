import {
    Mina,
    PrivateKey,
    PublicKey,
    UInt64,
    UInt32,
    AccountUpdate,
} from 'o1js';
import { CrowdfundingContract } from '../../crowd-funding-zkapp';

describe('CrowdfundingContract - Contribute', () => {

    // let Local: Awaited<ReturnType<typeof Mina.LocalBlockchain>>;
    let Local: any;
    let deployer: { publicKey: PublicKey; privateKey: PrivateKey };
    let beneficiary: { publicKey: PublicKey; privateKey: PrivateKey };
    let investor1: { publicKey: PublicKey; privateKey: PrivateKey };
    let investor2: { publicKey: PublicKey; privateKey: PrivateKey };
    let zkappKey: PrivateKey;
    let zkappAddress: PublicKey;
    let zkapp: CrowdfundingContract;
    let currentSlot: UInt32;

    beforeAll(async () => {
        // 设置本地区块链
        Local = await Mina.LocalBlockchain({ proofsEnabled: true });
        Mina.setActiveInstance(Local);

        // 获取测试账户
        [deployer, beneficiary, investor1, investor2] = Local.testAccounts;

        // 部署合约
        zkappKey = PrivateKey.random();
        zkappAddress = zkappKey.toPublicKey();
        zkapp = new CrowdfundingContract(zkappAddress);

        // 获取当前区块高度
        const networkState = await Local.getNetworkState();
        currentSlot = networkState.globalSlotSinceGenesis;

        // 编译合约
        await CrowdfundingContract.compile();
    });

    beforeEach(async () => {
        // 部署
        const tx = await Mina.transaction(deployer.publicKey, async () => {
            AccountUpdate.fundNewAccount(deployer.publicKey);
            zkapp.deploy({
                verificationKey: undefined,
                beneficiary: beneficiary.publicKey,
                hardCap: UInt64.from(10 * 1e9),
                endTime: UInt32.from(currentSlot.add(100))
            });
        });
        await tx.prove();
        await tx.sign([deployer.privateKey, zkappKey]).send();
    });

    it('should allow contribution when conditions are met', async () => {
        const amount = UInt64.from(1 * 1e9); // 1 MINA

        const tx = await Mina.transaction(investor1.publicKey, async () => {
            zkapp.contribute(amount);
        });
        await tx.prove();
        await expect(tx.sign([investor1.privateKey]).send()).resolves.toBeDefined();
    });

    it('should fail when window is closed', async () => {
        // 推进区块高度
        Local.incrementGlobalSlot(101);

        const amount = UInt64.from(1 * 1e9);

        await expect(async () => {
            const tx = await Mina.transaction(investor1.publicKey, async () => {
                zkapp.contribute(amount);
            });
            await tx.prove();
            await tx.sign([investor1.privateKey]).send();
        }).rejects.toThrow('window is closed');
    });

    it('should fail when hardcap is reached', async () => {
        // 首先达到硬顶
        const maxAmount = UInt64.from(10 * 1e9);
        const tx1 = await Mina.transaction(investor1.publicKey, async () => {
            zkapp.contribute(maxAmount);
        });
        await tx1.prove();
        await tx1.sign([investor1.privateKey]).send();

        // 尝试再次投资
        const amount = UInt64.from(1 * 1e9);
        await expect(async () => {
            const tx2 = await Mina.transaction(investor2.publicKey, async () => {
                zkapp.contribute(amount);
            });
            await tx2.prove();
            await tx2.sign([investor2.privateKey]).send();
        }).rejects.toThrow('hard cap reached');
    });
});