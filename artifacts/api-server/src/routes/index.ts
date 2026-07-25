import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import businessProfileRouter from "./businessProfile";
import leadsRouter from "./leads";
import assistantRouter from "./assistant";
import campaignsRouter from "./campaigns";
import storageRouter from "./storage";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(businessProfileRouter);
router.use(leadsRouter);
router.use(assistantRouter);
router.use(campaignsRouter);
router.use(storageRouter);
router.use(notificationsRouter);

export default router;
