import { Router, type IRouter } from "express";
import healthRouter from "./health";
import businessProfileRouter from "./businessProfile";
import leadsRouter from "./leads";

const router: IRouter = Router();

router.use(healthRouter);
router.use(businessProfileRouter);
router.use(leadsRouter);

export default router;
